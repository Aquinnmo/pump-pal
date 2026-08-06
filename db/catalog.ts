// Core catalog-cache logic, parametrized over SqlExecutor so it's testable
// against node:sqlite (db/catalog.test.ts) the same way db/outbox.ts and
// db/conflicts.ts are. db/catalog-repository.ts binds this to the real
// native db/client.ts for app use.
//
// See docs/data-model/exercises.md. Two write paths with different sync
// semantics:
//   - `replaceAll` — a full server-cache refresh (exerciseCatalogMeta
//     version bump). Only ever touches rows this repo previously marked
//     `synced`, so a user's own pending-review submission (sync_state
//     'dirty', not yet uploaded) survives a catalog refresh untouched.
//   - `createPending` — the "can't find my exercise" flow
//     (utils/create-pending-exercise.ts today) queues a local create.
import { SqlExecutor } from './executor';
import { enqueue } from './outbox';
import { normalizeTimestampsDeep } from './normalize-timestamps';
import { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';
import { StoredRecord } from '@/repositories/types';

type Row = {
  uid: string;
  id: string;
  data: string;
  updated_at: string;
  sync_state: 'synced' | 'dirty';
  server_version: string | null;
};

function fromRow(row: Row): StoredRecord<CatalogExercise> {
  return {
    id: row.id,
    data: JSON.parse(row.data) as CatalogExercise,
    syncState: row.sync_state,
    serverVersion: row.server_version,
    updatedAt: row.updated_at,
    deleted: false,
  };
}

export async function getAll(
  db: SqlExecutor,
  uid: string
): Promise<StoredRecord<CatalogExercise>[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM catalog_exercises WHERE uid = ?', [uid]);
  return rows.map(fromRow);
}

export async function getById(
  db: SqlExecutor,
  uid: string,
  id: string
): Promise<StoredRecord<CatalogExercise> | null> {
  const row = await db.getFirstAsync<Row>(
    'SELECT * FROM catalog_exercises WHERE uid = ? AND id = ?',
    [uid, id]
  );
  return row ? fromRow(row) : null;
}

/** Full server-cache refresh. Never touches the caller's own pending submissions. */
export async function replaceAll(
  db: SqlExecutor,
  uid: string,
  exercises: CatalogExercise[]
): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await replaceSyncedRows(db, uid, exercises, now);
  });
}

async function replaceSyncedRows(
  db: SqlExecutor,
  uid: string,
  exercises: CatalogExercise[],
  now: string
): Promise<void> {
  await db.runAsync(`DELETE FROM catalog_exercises WHERE uid = ? AND sync_state = 'synced'`, [uid]);
  for (const exercise of exercises) {
    const normalized = normalizeTimestampsDeep(exercise);
    await db.runAsync(
      `INSERT INTO catalog_exercises (uid, id, data, updated_at, sync_state, server_version)
       VALUES (?, ?, ?, ?, 'synced', NULL)
       ON CONFLICT(uid, id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at,
         sync_state = 'synced', server_version = NULL`,
      [uid, exercise.id, JSON.stringify(normalized), now]
    );
  }
}

/**
 * Commits a validated server snapshot and its cache-invalidation marker as one
 * transaction. Dirty pending-review submissions remain untouched.
 */
export async function replaceSnapshot(
  db: SqlExecutor,
  uid: string,
  exercises: CatalogExercise[],
  version: number
): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await replaceSyncedRows(db, uid, exercises, now);
    await db.runAsync(
      `INSERT INTO catalog_meta (uid, version, exercise_count, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         version = excluded.version, exercise_count = excluded.exercise_count, updated_at = excluded.updated_at`,
      [uid, version, exercises.length, now]
    );
  });
}

/** Local-only "can't find my exercise" submission — queued for upload. */
export async function createPending(
  db: SqlExecutor,
  uid: string,
  exercise: CatalogExercise
): Promise<void> {
  const now = new Date().toISOString();
  const normalized = normalizeTimestampsDeep(exercise);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO catalog_exercises (uid, id, data, updated_at, sync_state, server_version)
       VALUES (?, ?, ?, ?, 'dirty', NULL)
       ON CONFLICT(uid, id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at, sync_state = 'dirty'`,
      [uid, exercise.id, JSON.stringify(normalized), now]
    );
    await enqueue(db, {
      uid,
      entityType: 'catalog_exercise',
      entityId: exercise.id,
      op: 'create',
      payload: normalized,
      baseVersion: null,
    });
  });
}

/** Sync-engine only: acknowledge a pending submission without treating the
 * server's curated catalog as a per-user manifest entity. */
export async function markSynced(db: SqlExecutor, uid: string, id: string): Promise<void> {
  await db.runAsync(
    "UPDATE catalog_exercises SET sync_state = 'synced', updated_at = ? WHERE uid = ? AND id = ?",
    [new Date().toISOString(), uid, id]
  );
}

export async function getMeta(db: SqlExecutor, uid: string): Promise<ExerciseCatalogMeta | null> {
  const row = await db.getFirstAsync<{
    version: number;
    exercise_count: number;
    updated_at: string;
  }>('SELECT * FROM catalog_meta WHERE uid = ?', [uid]);
  if (!row) return null;
  return {
    version: row.version,
    exerciseCount: row.exercise_count,
    schemaVersion: 2,
    // Stored as ISO locally; consumers already tolerate multiple Timestamp-ish
    // shapes (see normalizeTimestampsDeep's doc comment).
    updatedAt: row.updated_at as unknown as ExerciseCatalogMeta['updatedAt'],
  };
}

export async function setMeta(
  db: SqlExecutor,
  uid: string,
  meta: Pick<ExerciseCatalogMeta, 'version' | 'exerciseCount'>
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO catalog_meta (uid, version, exercise_count, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET
       version = excluded.version, exercise_count = excluded.exercise_count, updated_at = excluded.updated_at`,
    [uid, meta.version, meta.exerciseCount, now]
  );
}
