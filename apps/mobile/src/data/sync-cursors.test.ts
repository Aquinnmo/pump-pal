import assert from 'node:assert/strict';
import { runMigrations } from './migrate';
import { openTestDb } from './test-executor';
import { getSyncCursor, setSyncCursor } from './sync-cursors';

async function main() {
  const { db } = openTestDb();
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
