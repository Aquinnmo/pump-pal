import { SqlExecutor } from './executor';
import { enqueue } from './outbox';
import { normalizeTimestampsDeep } from './normalize-timestamps';
import { Injury } from '@/types/user';
import { StoredRecord, SyncMeta } from '@/repositories/types';

type Row = {
  uid: string; id: string; data: string; sync_state: SyncMeta['syncState'];
  server_version: string | null; updated_at: string; deleted: number;
};

function fromRow(row: Row): StoredRecord<Injury> {
  return { id: row.id, data: JSON.parse(row.data) as Injury, syncState: row.sync_state,
    serverVersion: row.server_version, updatedAt: row.updated_at, deleted: !!row.deleted };
}

export async function getAll(db: SqlExecutor, uid: string): Promise<StoredRecord<Injury>[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM injuries WHERE uid = ? AND deleted = 0 ORDER BY updated_at DESC', [uid]);
  return rows.map(fromRow);
}

export async function getById(db: SqlExecutor, uid: string, id: string): Promise<StoredRecord<Injury> | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM injuries WHERE uid = ? AND id = ? AND deleted = 0', [uid, id]);
  return row ? fromRow(row) : null;
}

export async function write(
  db: SqlExecutor, uid: string, injury: Injury, op: 'create' | 'update',
  meta?: { syncState?: SyncMeta['syncState']; serverVersion?: string | null }
): Promise<void> {
  const normalized = normalizeTimestampsDeep(injury) as Injury;
  const syncState = meta?.syncState ?? 'dirty';
  let serverVersion = meta?.serverVersion;
  if (serverVersion === undefined) {
    const existing = await db.getFirstAsync<{ server_version: string | null }>('SELECT server_version FROM injuries WHERE uid = ? AND id = ?', [uid, injury.id]);
    serverVersion = existing?.server_version ?? null;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO injuries (uid, id, data, sync_state, server_version, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(uid, id) DO UPDATE SET data = excluded.data, sync_state = excluded.sync_state,
      server_version = excluded.server_version, updated_at = excluded.updated_at, deleted = 0`,
      [uid, injury.id, JSON.stringify(normalized), syncState, serverVersion, new Date().toISOString()]);
    if (syncState === 'dirty') await enqueue(db, { uid, entityType: 'injury', entityId: injury.id, op, payload: normalized, baseVersion: serverVersion });
  });
}

export function create(db: SqlExecutor, uid: string, injury: Injury) { return write(db, uid, injury, 'create'); }
export function update(db: SqlExecutor, uid: string, injury: Injury, meta?: { syncState?: SyncMeta['syncState']; serverVersion?: string | null }) { return write(db, uid, injury, 'update', meta); }

export async function softDelete(db: SqlExecutor, uid: string, id: string): Promise<void> {
  const existing = await getById(db, uid, id);
  if (!existing) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE injuries SET deleted = 1, sync_state = 'dirty', updated_at = ? WHERE uid = ? AND id = ?", [new Date().toISOString(), uid, id]);
    await enqueue(db, { uid, entityType: 'injury', entityId: id, op: 'delete', payload: null, baseVersion: existing.serverVersion });
  });
}

export async function removeClean(db: SqlExecutor, uid: string, id: string): Promise<void> {
  await db.runAsync("UPDATE injuries SET deleted = 1, sync_state = 'synced', updated_at = ? WHERE uid = ? AND id = ?", [new Date().toISOString(), uid, id]);
}
