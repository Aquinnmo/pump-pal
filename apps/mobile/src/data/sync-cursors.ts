// Authoritative sync checkpoints — one row per (uid, entityType), written by
// the sync engine (bead pump-pal-bkp.6) after a manifest reconciliation pass
// completes, so the next sync knows where it left off. Not written by
// repository mutations.
import { SqlExecutor } from './executor';

export type SyncCursor = {
  uid: string;
  entityType: string;
  lastSyncedAt: string | null;
  manifestVersion: string | null;
};

export async function getSyncCursor(
  db: SqlExecutor,
  uid: string,
  entityType: string
): Promise<SyncCursor | null> {
  const row = await db.getFirstAsync<{
    uid: string;
    entity_type: string;
    last_synced_at: string | null;
    manifest_version: string | null;
  }>('SELECT * FROM sync_cursors WHERE uid = ? AND entity_type = ?', [uid, entityType]);
  if (!row) return null;
  return {
    uid: row.uid,
    entityType: row.entity_type,
    lastSyncedAt: row.last_synced_at,
    manifestVersion: row.manifest_version,
  };
}

export async function setSyncCursor(
  db: SqlExecutor,
  cursor: SyncCursor
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (uid, entity_type, last_synced_at, manifest_version)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(uid, entity_type) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       manifest_version = excluded.manifest_version`,
    [cursor.uid, cursor.entityType, cursor.lastSyncedAt, cursor.manifestVersion]
  );
}
