import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import { getSyncCursor, setSyncCursor } from './sync-cursors';

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

async function main() {
  const raw = new DatabaseSync(':memory:');
  const db = toExecutor(raw);
  await runMigrations(db);

  assert.equal(await getSyncCursor(db, 'u1', 'workouts'), null);

  await setSyncCursor(db, {
    uid: 'u1',
    entityType: 'workouts',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    manifestVersion: 'v1',
  });
  const cursor = await getSyncCursor(db, 'u1', 'workouts');
  assert.deepEqual(cursor, {
    uid: 'u1',
    entityType: 'workouts',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    manifestVersion: 'v1',
  });

  // Upsert overwrites rather than duplicating.
  await setSyncCursor(db, {
    uid: 'u1',
    entityType: 'workouts',
    lastSyncedAt: '2026-01-02T00:00:00.000Z',
    manifestVersion: 'v2',
  });
  const updated = await getSyncCursor(db, 'u1', 'workouts');
  assert.equal(updated?.manifestVersion, 'v2');
  const all = await db.getAllAsync('SELECT * FROM sync_cursors');
  assert.equal(all.length, 1);

  console.log('src/data/sync-cursors.test.ts: all assertions passed');
}

main();
