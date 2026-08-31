import assert from 'node:assert/strict';
import { runMigrations } from './migrate';
import { openTestDb } from './test-executor';
import { SqlExecutor } from './executor';
import { getById, replaceSnapshot, createPending, getMeta } from './catalog';
import { listAll } from './outbox';
import { CatalogExercise } from '@/types/workout';

function exercise(id: string, name: string): CatalogExercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    primaryMuscles: ['chest'] as any,
    secondaryMuscles: [],
    movementPattern: '',
    equipment: [],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps'] as any,
    variations: [],
    schemaVersion: 2,
  };
}

async function main() {
  const { db } = openTestDb();
  await runMigrations(db);

  // --- createPending queues a user submission and coalesced outbox entry ---
  await createPending(db, 'u1', exercise('user-curl-thing', 'My Curl'));
  const pending = await getById(db, 'u1', 'user-curl-thing');
  assert.equal(pending?.syncState, 'dirty');
  const outboxRows = await listAll(db, 'u1');
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].entityType, 'catalog_exercise');
  assert.equal(outboxRows[0].op, 'create');

  // --- a refresh atomically replaces synced rows and its cache marker ---
  assert.equal(await getMeta(db, 'u1'), null);
  await replaceSnapshot(db, 'u1', [exercise('bench-press', 'Bench Press v3')], 3);
  const meta = await getMeta(db, 'u1');
  assert.equal(meta?.version, 3);
  assert.equal(meta?.exerciseCount, 1);
  assert.equal((await getById(db, 'u1', 'bench-press'))?.data.name, 'Bench Press v3');
  assert.equal((await getById(db, 'u1', 'user-curl-thing'))?.syncState, 'dirty');

  // A metadata failure rolls back the row replacement too; no partial snapshot
  // can be observed by the UI after an interrupted refresh.
  const failingDb: SqlExecutor = {
    ...db,
    runAsync: async (sql, params) => {
      if (sql.includes('INSERT INTO catalog_meta')) throw new Error('metadata write failed');
      return db.runAsync(sql, params);
    },
  };
  await assert.rejects(() => replaceSnapshot(failingDb, 'u1', [exercise('squat', 'Squat v2')], 4));
  assert.equal((await getById(db, 'u1', 'squat')), null);
  assert.equal((await getById(db, 'u1', 'bench-press'))?.data.name, 'Bench Press v3');
  assert.equal((await getMeta(db, 'u1'))?.version, 3);

  console.log('src/data/catalog.test.ts: all assertions passed');
}

main();
