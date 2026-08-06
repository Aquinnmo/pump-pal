// Core native workout repository logic, parametrized over SqlExecutor (see
// db/catalog.ts, db/outbox.ts for the same pattern) so it's testable against
// node:sqlite. db/workout-repository.ts binds this to db/client.ts for app
// use.
//
// Every mutation writes the `workouts` row and its outbox intent in one
// `withTransactionAsync` call, so a crash mid-write can never leave an
// entity mutated without a matching queued intent (or vice versa) — see
// docs/purpose.md's fidelity rule: a half-written workout is wrong data.
import { SqlExecutor } from './executor';
import { enqueue } from './outbox';
import { normalizeTimestampsDeep } from './normalize-timestamps';
import { randomId } from './id';
import { Workout, WorkoutStatus } from '@/types/workout';
import { StoredRecord } from '@/repositories/types';
import { ConflictRecord, resolveConflict } from './conflicts';

const ENTITY_TYPE = 'workout';

type Row = {
  uid: string;
  id: string;
  data: string;
  date: string | null;
  status: string | null;
  sync_state: 'synced' | 'dirty' | 'conflict';
  server_version: string | null;
  updated_at: string;
  deleted: number;
};

function fromRow(row: Row): StoredRecord<Workout> {
  return {
    id: row.id,
    data: JSON.parse(row.data) as Workout,
    syncState: row.sync_state,
    serverVersion: row.server_version,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

function dateColumn(workout: Workout): string | null {
  // date is absent on planned/in_progress docs by design (see types/workout.ts) —
  // the column stays null so the existing "excludes non-completed workouts"
  // query shape carries over unchanged.
  if (!workout.date) return null;
  return normalizeTimestampsDeep(workout.date as never) as unknown as string;
}

/** Live (not soft-deleted) workouts for this uid, most recent first. Callers filter/sort further as needed. */
export async function getAll(db: SqlExecutor, uid: string): Promise<StoredRecord<Workout>[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM workouts WHERE uid = ? AND deleted = 0 ORDER BY date DESC',
    [uid]
  );
  return rows.map(fromRow);
}

/**
 * Dated workout history for UI/analytics consumers. Missing status is the
 * legacy representation of completed, while planned/in-progress rows are
 * intentionally excluded even if a malformed row happens to carry a date.
 */
export async function getHistory(db: SqlExecutor, uid: string): Promise<StoredRecord<Workout>[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM workouts
     WHERE uid = ? AND deleted = 0 AND date IS NOT NULL
       AND (status IS NULL OR status = 'completed')
     ORDER BY date DESC`,
    [uid]
  );
  return rows.map(fromRow);
}

export async function getByStatus(
  db: SqlExecutor,
  uid: string,
  status: WorkoutStatus
): Promise<StoredRecord<Workout>[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM workouts WHERE uid = ? AND deleted = 0 AND status = ? ORDER BY date ASC',
    [uid, status]
  );
  return rows.map(fromRow);
}

export async function getById(
  db: SqlExecutor,
  uid: string,
  id: string
): Promise<StoredRecord<Workout> | null> {
  const row = await db.getFirstAsync<Row>(
    'SELECT * FROM workouts WHERE uid = ? AND id = ? AND deleted = 0',
    [uid, id]
  );
  return row ? fromRow(row) : null;
}

// Does the actual INSERT + outbox enqueue with no transaction wrapper of its
// own, so callers that need to write several rows atomically (reorderQueue)
// can wrap one shared transaction around multiple calls instead of nesting
// transactions (which expo-sqlite, like the node:sqlite test adapter, does
// not support).
async function writeRowStatements(
  db: SqlExecutor,
  uid: string,
  id: string,
  workout: Workout,
  op: 'create' | 'update',
  meta?: { syncState?: 'synced' | 'dirty' | 'conflict'; serverVersion?: string | null }
): Promise<void> {
  const now = new Date().toISOString();
  const normalized = normalizeTimestampsDeep({ ...workout, id, userId: uid });
  const syncState = meta?.syncState ?? 'dirty';
  // Undefined (not explicitly passed) means "preserve whatever version this
  // row already has" — a plain user edit doesn't know or care what the
  // server version is, but the outbox intent still needs the *real* last-
  // known version as its baseVersion, not null (null would read server-side
  // as "never synced" and falsely conflict with the row that already exists).
  let serverVersion = meta?.serverVersion;
  if (serverVersion === undefined) {
    const existing = await db.getFirstAsync<{ server_version: string | null }>(
      'SELECT server_version FROM workouts WHERE uid = ? AND id = ?',
      [uid, id]
    );
    serverVersion = existing?.server_version ?? null;
  }

  await db.runAsync(
    `INSERT INTO workouts (uid, id, data, date, status, sync_state, server_version, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(uid, id) DO UPDATE SET
       data = excluded.data, date = excluded.date, status = excluded.status,
       sync_state = excluded.sync_state, server_version = excluded.server_version,
       updated_at = excluded.updated_at, deleted = 0`,
    [uid, id, JSON.stringify(normalized), dateColumn(workout), workout.status ?? null, syncState, serverVersion, now]
  );
  // Server-applied writes (sync engine downloading the authoritative doc)
  // must not re-queue an outbox intent — only user-originated writes do.
  if (syncState === 'dirty') {
    await enqueue(db, {
      uid,
      entityType: ENTITY_TYPE,
      entityId: id,
      op,
      payload: normalized,
      baseVersion: serverVersion,
    });
  }
}

async function writeRow(
  db: SqlExecutor,
  uid: string,
  id: string,
  workout: Workout,
  op: 'create' | 'update',
  meta?: { syncState?: 'synced' | 'dirty' | 'conflict'; serverVersion?: string | null }
): Promise<void> {
  await db.withTransactionAsync(() => writeRowStatements(db, uid, id, workout, op, meta));
}

/** Creates a workout with a locally-generated, stable id — offline creates never need a server round-trip to exist. */
export async function create(
  db: SqlExecutor,
  uid: string,
  workout: Omit<Workout, 'id' | 'userId'>
): Promise<string> {
  const id = randomId();
  await writeRow(db, uid, id, { ...workout, id, userId: uid } as Workout, 'create');
  return id;
}

export async function update(
  db: SqlExecutor,
  uid: string,
  id: string,
  workout: Workout,
  meta?: { syncState?: 'synced' | 'dirty' | 'conflict'; serverVersion?: string | null }
): Promise<void> {
  await writeRow(db, uid, id, workout, 'update', meta);
}

/** Tombstones the row (kept for sync) and queues a delete intent, atomically. */
export async function softDelete(db: SqlExecutor, uid: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ server_version: string | null }>(
      'SELECT server_version FROM workouts WHERE uid = ? AND id = ? AND deleted = 0',
      [uid, id]
    );
    const result = await db.runAsync(
      'UPDATE workouts SET deleted = 1, sync_state = ?, updated_at = ? WHERE uid = ? AND id = ?',
      ['dirty', now, uid, id]
    );
    if (result.changes === 0) return; // nothing to delete — no-op, no orphan outbox row
    await enqueue(db, {
      uid,
      entityType: ENTITY_TYPE,
      entityId: id,
      op: 'delete',
      payload: null,
      // The row's last-known server version, so a delete on an already-synced
      // workout carries the real baseVersion instead of a null that would
      // falsely conflict server-side (see writeRowStatements' same fix).
      baseVersion: existing?.server_version ?? null,
    });
  });
}

/** Sync-engine only: a manifest-driven remote deletion. No outbox intent — the server, not the user, drove this. */
export async function removeClean(db: SqlExecutor, uid: string, id: string): Promise<void> {
  await db.runAsync('UPDATE workouts SET deleted = 1, sync_state = ?, updated_at = ? WHERE uid = ? AND id = ?', [
    'synced',
    new Date().toISOString(),
    uid,
    id,
  ]);
}

/** Sync-engine only: marks a row conflicted (dirty local vs. stale/missing remote) after recording the conflict. */
export async function markConflict(db: SqlExecutor, uid: string, id: string): Promise<void> {
  await db.runAsync('UPDATE workouts SET sync_state = ?, updated_at = ? WHERE uid = ? AND id = ?', [
    'conflict',
    new Date().toISOString(),
    uid,
    id,
  ]);
}

/**
 * Rewrites queueOrder for a full ordered list of planned-workout ids in one
 * transaction, so a reorder is atomic — never half-applied, never
 * renumbered against a stale read.
 */
export async function reorderQueue(
  db: SqlExecutor,
  uid: string,
  orderedIds: string[]
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const row = await db.getFirstAsync<Row>('SELECT * FROM workouts WHERE uid = ? AND id = ?', [
        uid,
        id,
      ]);
      if (!row) continue;
      const workout = { ...(JSON.parse(row.data) as Workout), queueOrder: i };
      // Reordering is always a local mutation that must sync, regardless of
      // the row's prior sync_state — only preserve serverVersion as the
      // conflict-detection baseline.
      await writeRowStatements(db, uid, id, workout, 'update', {
        syncState: 'dirty',
        serverVersion: row.server_version,
      });
    }
  });
}

function remoteVersion(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const version = (data as { version?: unknown }).version;
  return typeof version === 'string' ? version : null;
}

function remoteWorkoutToLocal(uid: string, data: unknown): Workout {
  const dto = data as Record<string, unknown>;
  return {
    id: String(dto.id),
    userId: uid,
    name: String(dto.name ?? ''),
    date: dto.date as Workout['date'],
    status: dto.status as WorkoutStatus,
    startedAt: dto.startedAt as Workout['startedAt'],
    queueOrder: dto.queueOrder as number | undefined,
    notes: dto.notes as string | undefined,
    performedExercises: (dto.performedExercises ?? []) as Workout['performedExercises'],
    injuries: dto.injuries as string[] | undefined,
    createdAt: dto.createdAt as Workout['createdAt'],
    updatedAt: dto.updatedAt as Workout['updatedAt'],
    schemaVersion: 2,
  };
}

/**
 * Applies "Keep This Device" in the same transaction that marks the conflict
 * resolved. A remote deletion becomes a fresh create; a remote record uses
 * its recorded opaque version as the retry baseline. Neither case can leave a
 * resolved conflict without a durable replacement intent.
 */
export async function resolveKeepLocal(
  db: SqlExecutor,
  conflict: ConflictRecord
): Promise<void> {
  if (conflict.entityType !== ENTITY_TYPE) throw new Error(`Unsupported conflict type: ${conflict.entityType}`);
  const local = conflict.localData as Workout;
  const version = remoteVersion(conflict.serverData);
  await db.withTransactionAsync(async () => {
    await writeRowStatements(
      db,
      conflict.uid,
      conflict.entityId,
      { ...local, id: conflict.entityId, userId: conflict.uid },
      conflict.serverData === null ? 'create' : 'update',
      { syncState: 'dirty', serverVersion: version }
    );
    await resolveConflict(db, conflict.id);
  });
}

/**
 * Applies "Use Server Copy" atomically. A remote deletion removes the local
 * row; otherwise the downloaded version is stored as clean and no outbox row
 * is created. The original local JSON remains in the resolved conflict audit
 * row rather than being silently discarded.
 */
export async function resolveUseServer(
  db: SqlExecutor,
  conflict: ConflictRecord
): Promise<void> {
  if (conflict.entityType !== ENTITY_TYPE) throw new Error(`Unsupported conflict type: ${conflict.entityType}`);
  await db.withTransactionAsync(async () => {
    if (conflict.serverData === null) {
      await removeClean(db, conflict.uid, conflict.entityId);
    } else {
      const server = remoteWorkoutToLocal(conflict.uid, conflict.serverData);
      await writeRowStatements(db, conflict.uid, conflict.entityId, server, 'update', {
        syncState: 'synced',
        serverVersion: remoteVersion(conflict.serverData),
      });
    }
    await resolveConflict(db, conflict.id);
  });
}
