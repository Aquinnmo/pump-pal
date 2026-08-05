// Generic native repository for the two "one row per uid" entities —
// profile (users/{uid}) and pushup_challenge (users/{uid}/pushup-challenge/
// data). Both tables share the exact same column layout (see
// db/schema.ts), so one factory implements repositories/types.ts's
// LocalSingletonRepository<T> for either instead of two near-duplicate files.
import { SqlExecutor } from './executor';
import { LocalSingletonRepository, StoredRecord, SyncMeta } from '@/repositories/types';
import { enqueue } from './outbox';
import { normalizeTimestampsDeep } from './normalize-timestamps';

export type SingletonTable = 'profile' | 'pushup_challenge';

type Row = {
  uid: string;
  data: string;
  sync_state: SyncMeta['syncState'];
  server_version: string | null;
  updated_at: string;
  deleted: number;
};

function fromRow<T>(row: Row): StoredRecord<T> {
  return {
    id: row.uid,
    data: JSON.parse(row.data) as T,
    syncState: row.sync_state,
    serverVersion: row.server_version,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

export type SingletonSyncOps = {
  /** Sync-engine only: manifest-driven remote deletion. No outbox intent. */
  removeClean(uid: string): Promise<void>;
  /** Sync-engine only: marks the row conflicted after recording the conflict. */
  markConflict(uid: string): Promise<void>;
};

export async function getSingleton<T>(db: SqlExecutor, table: SingletonTable, uid: string): Promise<StoredRecord<T> | null> {
  const row = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE uid = ? AND deleted = 0`, [uid]);
  return row ? fromRow<T>(row) : null;
}

export async function upsertSingleton<T>(
  db: SqlExecutor, table: SingletonTable, entityType: string, uid: string, entity: T, meta?: Partial<SyncMeta>
): Promise<void> {
  const now = new Date().toISOString();
  const normalized = normalizeTimestampsDeep(entity);
  const syncState = meta?.syncState ?? 'dirty';
  let serverVersion = meta?.serverVersion;
  if (serverVersion === undefined) {
    const existing = await db.getFirstAsync<{ server_version: string | null }>(`SELECT server_version FROM ${table} WHERE uid = ?`, [uid]);
    serverVersion = existing?.server_version ?? null;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO ${table} (uid, data, sync_state, server_version, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(uid) DO UPDATE SET data = excluded.data, sync_state = excluded.sync_state,
      server_version = excluded.server_version, updated_at = excluded.updated_at, deleted = 0`,
      [uid, JSON.stringify(normalized), syncState, serverVersion, now]);
    if (syncState === 'dirty') await enqueue(db, { uid, entityType, entityId: uid, op: 'update', payload: normalized, baseVersion: serverVersion });
  });
}

export async function removeCleanSingleton(db: SqlExecutor, table: SingletonTable, uid: string): Promise<void> {
  await db.runAsync(`UPDATE ${table} SET deleted = 1, sync_state = 'synced', updated_at = ? WHERE uid = ?`, [new Date().toISOString(), uid]);
}
export async function markSingletonConflict(db: SqlExecutor, table: SingletonTable, uid: string): Promise<void> {
  await db.runAsync(`UPDATE ${table} SET sync_state = 'conflict', updated_at = ? WHERE uid = ?`, [new Date().toISOString(), uid]);
}

export function createSingletonRepository<T>(
  getDb: () => Promise<SqlExecutor>,
  table: SingletonTable,
  entityType: string
): LocalSingletonRepository<T> & SingletonSyncOps {
  return {
    async get(uid) {
      const db = await getDb();
      return getSingleton<T>(db, table, uid);
    },

    async upsert(uid, entity, meta) {
      const db = await getDb();
      await upsertSingleton(db, table, entityType, uid, entity, meta);
    },

    async removeClean(uid) {
      const db = await getDb();
      await removeCleanSingleton(db, table, uid);
    },

    async markConflict(uid) {
      const db = await getDb();
      await markSingletonConflict(db, table, uid);
    },
  };
}
