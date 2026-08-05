import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import { recordConflict, listUnresolved, getConflict, resolveConflict } from './conflicts';

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
  // --- records both sides, including a remote deletion (serverData: null) ---
  {
    const db = await freshDb();
    const id = await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: { name: 'Push (edited offline)' },
      serverData: null,
    });
    const conflict = await getConflict(db, id);
    assert.ok(conflict);
    assert.deepEqual(conflict!.localData, { name: 'Push (edited offline)' });
    assert.equal(conflict!.serverData, null);
    assert.equal(conflict!.resolvedAt, null);
  }

  // --- re-detecting before resolution updates the existing row, doesn't duplicate ---
  {
    const db = await freshDb();
    const id1 = await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: { v: 1 },
      serverData: { v: 'server-1' },
    });
    const id2 = await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: { v: 2 },
      serverData: { v: 'server-2' },
    });
    assert.equal(id1, id2, 'same unresolved conflict row is reused');
    const unresolved = await listUnresolved(db, 'u1');
    assert.equal(unresolved.length, 1);
    assert.deepEqual(unresolved[0].localData, { v: 2 });
  }

  // --- resolving frees it up for a fresh conflict to be recorded on the same entity ---
  {
    const db = await freshDb();
    const id = await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: { v: 1 },
      serverData: { v: 'server-1' },
    });
    await resolveConflict(db, id);
    assert.equal((await listUnresolved(db, 'u1')).length, 0);

    const newId = await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: { v: 3 },
      serverData: { v: 'server-3' },
    });
    assert.notEqual(newId, id, 'a resolved conflict is not reused for a new detection');
    assert.equal((await listUnresolved(db, 'u1')).length, 1);
  }

  // --- UID isolation ---
  {
    const db = await freshDb();
    await recordConflict(db, {
      uid: 'u1',
      entityType: 'workout',
      entityId: 'w1',
      localData: {},
      serverData: {},
    });
    await recordConflict(db, {
      uid: 'u2',
      entityType: 'workout',
      entityId: 'w1',
      localData: {},
      serverData: {},
    });
    assert.equal((await listUnresolved(db, 'u1')).length, 1);
    assert.equal((await listUnresolved(db, 'u2')).length, 1);
  }

  console.log('db/conflicts.test.ts: all assertions passed');
}

main();
