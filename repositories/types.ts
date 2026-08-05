// Platform-neutral repository contracts. No Firestore, no expo-sqlite, no
// HTTP types here — native (SQLite, bead pump-pal-bkp.2/.3) and web (API
// client, bead pump-pal-bkp.5) both implement these, and UI/util call sites
// (bead pump-pal-bkp.9) depend only on this file, never on a concrete
// implementation or on `Platform.OS`.

export type SyncState = 'synced' | 'dirty' | 'conflict';

/** Sync bookkeeping carried alongside every stored entity. */
export type SyncMeta = {
  syncState: SyncState;
  /** Opaque version token from the server manifest; null until first synced. */
  serverVersion: string | null;
  updatedAt: string; // ISO 8601
  deleted: boolean; // tombstone — filtered from reads, kept for sync
};

export type StoredRecord<TEntity> = {
  id: string;
  data: TEntity;
} & SyncMeta;

/**
 * CRUD contract every uid-scoped local entity repository implements.
 * `uid` is a required first argument everywhere (not ambient state) so a
 * call site can't accidentally read/write across accounts — see
 * db/schema.ts's uid-scoped tables and db/client.ts's purgeUidData.
 */
export interface LocalRepository<TEntity> {
  getAll(uid: string): Promise<StoredRecord<TEntity>[]>;
  getById(uid: string, id: string): Promise<StoredRecord<TEntity> | null>;
  /** Upserts the entity and marks it dirty (queued for outbox sync) unless `meta` overrides that. */
  upsert(uid: string, id: string, entity: TEntity, meta?: Partial<SyncMeta>): Promise<void>;
  softDelete(uid: string, id: string): Promise<void>;
}

/** Single-document repositories (profile, pushup challenge): one row per uid. */
export interface LocalSingletonRepository<TEntity> {
  get(uid: string): Promise<StoredRecord<TEntity> | null>;
  upsert(uid: string, entity: TEntity, meta?: Partial<SyncMeta>): Promise<void>;
}
