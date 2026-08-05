import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import { getAll, getById, replaceAll, createPending, getMeta, setMeta } from './catalog';
import { listAll } from './outbox';
import { CatalogExercise } from '@/types/workout';

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
  const raw = new DatabaseSync(':memory:');
  const db = toExecutor(raw);
  await runMigrations(db);

  // --- replaceAll seeds the synced catalog ---
  await replaceAll(db, 'u1', [exercise('bench-press', 'Bench Press'), exercise('squat', 'Squat')]);
  assert.equal((await getAll(db, 'u1')).length, 2);
  const bench = await getById(db, 'u1', 'bench-press');
  assert.equal(bench?.syncState, 'synced');

  // --- createPending queues a user submission and coalesced outbox entry ---
  await createPending(db, 'u1', exercise('user-curl-thing', 'My Curl'));
  const pending = await getById(db, 'u1', 'user-curl-thing');
  assert.equal(pending?.syncState, 'dirty');
  const outboxRows = await listAll(db, 'u1');
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].entityType, 'catalog_exercise');
  assert.equal(outboxRows[0].op, 'create');

  // --- a catalog refresh replaces synced rows but never touches the pending submission ---
  await replaceAll(db, 'u1', [exercise('bench-press', 'Bench Press v2'), exercise('deadlift', 'Deadlift')]);
  const all = await getAll(db, 'u1');
  const ids = all.map((r) => r.id).sort();
  assert.deepEqual(ids, ['bench-press', 'deadlift', 'user-curl-thing']);
  const stillPending = await getById(db, 'u1', 'user-curl-thing');
  assert.equal(stillPending?.syncState, 'dirty', 'pending submission must survive a catalog refresh');
  const squatGone = await getById(db, 'u1', 'squat');
  assert.equal(squatGone, null, 'exercises dropped from the server set are removed from the synced cache');

  // --- catalog_meta cache-invalidation marker ---
  assert.equal(await getMeta(db, 'u1'), null);
  await setMeta(db, 'u1', { version: 3, exerciseCount: 74 });
  const meta = await getMeta(db, 'u1');
  assert.equal(meta?.version, 3);
  assert.equal(meta?.exerciseCount, 74);

  // --- UID isolation ---
  await replaceAll(db, 'u2', [exercise('bench-press', 'Bench Press')]);
  assert.equal((await getAll(db, 'u1')).length, 3);
  assert.equal((await getAll(db, 'u2')).length, 1);

  console.log('db/catalog.test.ts: all assertions passed');
}

main();
