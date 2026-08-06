import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import { getAll, getHistory, getByStatus, getById, create, update, softDelete, reorderQueue } from './workouts';
import { listAll } from './outbox';
import { Workout } from '@/types/workout';

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

function baseWorkout(overrides: Partial<Workout> = {}): Omit<Workout, 'id' | 'userId'> {
  return {
    name: 'Push',
    date: { seconds: 1750000000, nanoseconds: 0 } as any,
    performedExercises: [],
    schemaVersion: 2,
    status: 'completed',
    ...overrides,
  } as Omit<Workout, 'id' | 'userId'>;
}

async function main() {
  const raw = new DatabaseSync(':memory:');
  const db = toExecutor(raw);
  await runMigrations(db);

  // --- create() generates a stable local id and works fully offline ---
  const id = await create(db, 'u1', baseWorkout());
  assert.ok(id.length > 0);
  const stored = await getById(db, 'u1', id);
  assert.ok(stored);
  assert.equal(stored!.data.name, 'Push');
  assert.equal(stored!.data.id, id);
  assert.equal(stored!.data.userId, 'u1');
  // date normalized from {seconds,nanoseconds} to ISO for local storage.
  assert.equal(stored!.data.date, new Date(1750000000 * 1000).toISOString());
  assert.equal(stored!.syncState, 'dirty');

  // Create queues a coalesced 'create' outbox intent.
  let outbox = await listAll(db, 'u1');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].op, 'create');
  assert.equal(outbox[0].entityId, id);

  // --- update() atomically rewrites entity + coalesces the outbox intent ---
  await update(db, 'u1', id, { ...stored!.data, name: 'Push (edited)' });
  const afterUpdate = await getById(db, 'u1', id);
  assert.equal(afterUpdate!.data.name, 'Push (edited)');
  outbox = await listAll(db, 'u1');
  assert.equal(outbox.length, 1, 'update coalesces into the still-unsynced create');
  assert.equal(outbox[0].op, 'create', 'never-synced create stays a create after an edit');

  // --- getByStatus filters correctly ---
  await create(db, 'u1', baseWorkout({ name: 'Planned Pull', status: 'planned', date: undefined }));
  const planned = await getByStatus(db, 'u1', 'planned');
  assert.equal(planned.length, 1);
  assert.equal(planned[0].data.name, 'Planned Pull');
  const completed = await getByStatus(db, 'u1', 'completed');
  assert.equal(completed.length, 1);

  // --- getHistory preserves legacy completed rows and excludes queue/live rows ---
  await create(db, 'u1', baseWorkout({ name: 'Legacy completed', status: undefined }));
  await create(db, 'u1', baseWorkout({ name: 'Malformed live row', status: 'in_progress' }));
  const history = await getHistory(db, 'u1');
  assert.deepEqual(
    new Set(history.map((row) => row.data.name)),
    new Set(['Push (edited)', 'Legacy completed']),
  );

  // --- softDelete: create -> delete cancels the outbox entirely (never synced) ---
  const id2 = await create(db, 'u1', baseWorkout({ name: 'Throwaway' }));
  await softDelete(db, 'u1', id2);
  assert.equal(await getById(db, 'u1', id2), null, 'soft-deleted rows are excluded from reads');
  assert.equal(
    (await listAll(db, 'u1')).find((r) => r.entityId === id2),
    undefined,
    'a create that was never synced, then deleted, leaves no outbox row'
  );

  // --- softDelete on an already-synced workout queues a real delete intent ---
  const id3 = await create(db, 'u1', baseWorkout({ name: 'Synced one' }));
  // Simulate the sync engine having acknowledged the create.
  const claimedRow = (await listAll(db, 'u1')).find((r) => r.entityId === id3)!;
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [claimedRow.id]);
  await db.runAsync('UPDATE workouts SET sync_state = ?, server_version = ? WHERE uid = ? AND id = ?', [
    'synced',
    'v1',
    'u1',
    id3,
  ]);
  await softDelete(db, 'u1', id3);
  const deleteIntent = (await listAll(db, 'u1')).find((r) => r.entityId === id3);
  assert.ok(deleteIntent, 'delete on a synced workout must queue a delete intent');
  assert.equal(deleteIntent!.op, 'delete');
  assert.equal(deleteIntent!.baseVersion, 'v1', 'softDelete must carry the row\'s last-known server version as baseVersion');

  // --- softDelete twice is a no-op the second time (no duplicate/orphan outbox row) ---
  const beforeCount = (await listAll(db, 'u1')).length;
  await softDelete(db, 'u1', id3);
  assert.equal((await listAll(db, 'u1')).length, beforeCount);

  // --- reorderQueue: atomic, stable local ids, queueOrder persists ---
  const p1 = await create(db, 'u1', baseWorkout({ name: 'A', status: 'planned', date: undefined }));
  const p2 = await create(db, 'u1', baseWorkout({ name: 'B', status: 'planned', date: undefined }));
  const p3 = await create(db, 'u1', baseWorkout({ name: 'C', status: 'planned', date: undefined }));
  await reorderQueue(db, 'u1', [p3, p1, p2]);
  const orderedC = await getById(db, 'u1', p3);
  const orderedA = await getById(db, 'u1', p1);
  const orderedB = await getById(db, 'u1', p2);
  assert.equal(orderedC!.data.queueOrder, 0);
  assert.equal(orderedA!.data.queueOrder, 1);
  assert.equal(orderedB!.data.queueOrder, 2);
  // ids never changed across the reorder.
  assert.equal(orderedC!.data.id, p3);

  // --- transaction-failure: a broken write must not leave a partial entity or orphan outbox row ---
  {
    const failingDb: SqlExecutor = {
      ...db,
      runAsync: async (sql, params) => {
        if (sql.includes('INSERT INTO outbox')) throw new Error('simulated failure');
        return db.runAsync(sql, params);
      },
    };
    const beforeAll = await getAll(db, 'u1');
    const beforeOutbox = await listAll(db, 'u1');
    await assert.rejects(() => create(failingDb, 'u1', baseWorkout({ name: 'Should not persist' })));
    const afterAll = await getAll(db, 'u1');
    const afterOutbox = await listAll(db, 'u1');
    assert.equal(afterAll.length, beforeAll.length, 'failed create must not leave a partial entity row');
    assert.equal(afterOutbox.length, beforeOutbox.length, 'failed create must not leave an orphan outbox row');
  }

  // --- UID isolation ---
  await create(db, 'u2', baseWorkout({ name: 'u2 workout' }));
  const u1All = await getAll(db, 'u1');
  const u2All = await getAll(db, 'u2');
  assert.equal(u2All.length, 1);
  assert.ok(!u1All.some((w) => w.data.name === 'u2 workout'));

  console.log('db/workouts.test.ts: all assertions passed');
}

main();
