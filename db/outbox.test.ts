import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import {
  coalesce,
  enqueue,
  claimPending,
  releaseStaleClaims,
  release,
  acknowledge,
  recordRetry,
  listAll,
} from './outbox';

function toExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

async function freshDb() {
  const raw = new DatabaseSync(':memory:');
  const db = toExecutor(raw);
  await runMigrations(db);
  return db;
}

async function main() {
  // --- Pure coalescing state machine ---
  {
    // none + create -> create
    assert.deepEqual(coalesce(null, { op: 'create', payload: { a: 1 }, baseVersion: null }), {
      op: 'create',
      payload: { a: 1 },
      baseVersion: null,
    });
    // create + update -> still create, latest payload
    assert.deepEqual(
      coalesce(
        { op: 'create', baseVersion: null },
        { op: 'update', payload: { a: 2 }, baseVersion: 'v9-should-be-ignored' }
      ),
      { op: 'create', payload: { a: 2 }, baseVersion: null }
    );
    // create + delete -> dropped entirely (never synced)
    assert.equal(
      coalesce({ op: 'create', baseVersion: null }, { op: 'delete', payload: null, baseVersion: null }),
      null
    );
    // update + update -> keeps original baseVersion, latest payload
    assert.deepEqual(
      coalesce(
        { op: 'update', baseVersion: 'v1' },
        { op: 'update', payload: { a: 3 }, baseVersion: 'v2-ignored' }
      ),
      { op: 'update', payload: { a: 3 }, baseVersion: 'v1' }
    );
    // update + delete -> delete, keeps baseVersion
    assert.deepEqual(
      coalesce({ op: 'update', baseVersion: 'v1' }, { op: 'delete', payload: null, baseVersion: null }),
      { op: 'delete', payload: null, baseVersion: 'v1' }
    );
    // delete + create -> update (server still has the row), keeps baseVersion
    assert.deepEqual(
      coalesce(
        { op: 'delete', baseVersion: 'v1' },
        { op: 'create', payload: { a: 4 }, baseVersion: null }
      ),
      { op: 'update', payload: { a: 4 }, baseVersion: 'v1' }
    );
  }

  // --- enqueue coalesces create-update-delete sequences in the real table ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: { name: 'Push' },
      baseVersion: null,
    });
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'update',
      payload: { name: 'Push v2' },
      baseVersion: null,
    });
    let rows = await listAll(db, 'u1');
    assert.equal(rows.length, 1, 'still one row after create+update');
    assert.equal(rows[0].op, 'create');
    assert.deepEqual(rows[0].payload, { name: 'Push v2' });

    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'delete',
      payload: null,
      baseVersion: null,
    });
    rows = await listAll(db, 'u1');
    assert.equal(rows.length, 0, 'create then delete cancels out entirely');
  }

  // --- claim/acknowledge: retries cannot lose an operation ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: { name: 'Push' },
      baseVersion: null,
    });
    const claimed = await claimPending(db, 'u1');
    assert.equal(claimed.length, 1);

    // A second claim call before release/ack must not double-claim the row.
    const claimedAgain = await claimPending(db, 'u1');
    assert.equal(claimedAgain.length, 0);

    // Simulate a failed sync attempt: the op must remain in the outbox, not vanish.
    await recordRetry(db, claimed[0].id, 'network error', new Date(Date.now() + 1000).toISOString());
    const stillThere = await listAll(db, 'u1');
    assert.equal(stillThere.length, 1);
    assert.equal(stillThere[0].attempts, 1);
    assert.equal(stillThere[0].claimedAt, null);

    // Not due yet (nextAttemptAt in the future) -> not claimable.
    const notYet = await claimPending(db, 'u1');
    assert.equal(notYet.length, 0);
  }

  // --- crash recovery: a stale claim (app killed mid-sync) becomes claimable again ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: {},
      baseVersion: null,
    });
    const claimed = await claimPending(db, 'u1');
    assert.equal(claimed.length, 1);
    // Backdate the claim to simulate it going stale, then reclaim.
    await db.runAsync('UPDATE outbox SET claimed_at = ? WHERE id = ?', [
      new Date(Date.now() - 10 * 60_000).toISOString(),
      claimed[0].id,
    ]);
    await releaseStaleClaims(db, 'u1', 5 * 60_000);
    const reclaimed = await claimPending(db, 'u1');
    assert.equal(reclaimed.length, 1, 'stale claim must be reclaimable');
  }

  // --- explicit release also frees the claim without touching retry state ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: {},
      baseVersion: null,
    });
    const [row] = await claimPending(db, 'u1');
    await release(db, row.id);
    const [again] = await claimPending(db, 'u1');
    assert.equal(again.attempts, 0);
  }

  // --- acknowledge removes the row (server accepted it) ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: {},
      baseVersion: null,
    });
    const [row] = await claimPending(db, 'u1');
    await acknowledge(db, row.id);
    assert.deepEqual(await listAll(db, 'u1'), []);
  }

  // --- UID isolation: claiming for one uid never returns another uid's rows ---
  {
    const db = await freshDb();
    await enqueue(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: {},
      baseVersion: null,
    });
    await enqueue(db, {
      uid: 'u2',
      entityType: 'workout',
      entityId: 'w1',
      op: 'create',
      payload: {},
      baseVersion: null,
    });
    const forU1 = await claimPending(db, 'u1');
    assert.equal(forU1.length, 1);
    assert.equal(forU1[0].uid, 'u1');
    assert.equal((await listAll(db, 'u2')).length, 1);
  }

  console.log('db/outbox.test.ts: all assertions passed');
}

main();
