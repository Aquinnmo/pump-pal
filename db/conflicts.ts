// Conflict persistence — created by the sync engine (bead pump-pal-bkp.6)
// when a dirty/stale local record collides with a remote change or remote
// deletion, resolved explicitly through the conflict UI (bead
// pump-pal-bkp.8). Never silently overwrites either side: both `localData`
// and `serverData` are retained until resolution, and `serverData: null`
// means "the server deleted this" — a real, distinct value from "no
// conflict", not an absent field.
import { SqlExecutor } from './executor';
import { randomId } from './id';

export type ConflictRecord = {
  id: string;
  uid: string;
  entityType: string;
  entityId: string;
  localData: unknown;
  /** null = the record was deleted on the server (remote tombstone). */
  serverData: unknown;
  detectedAt: string;
  resolvedAt: string | null;
};

type Raw = {
  id: string;
  uid: string;
  entity_type: string;
  entity_id: string;
  local_data: string;
  server_data: string;
  detected_at: string;
  resolved_at: string | null;
};

function fromRow(r: Raw): ConflictRecord {
  return {
    id: r.id,
    uid: r.uid,
    entityType: r.entity_type,
    entityId: r.entity_id,
    localData: JSON.parse(r.local_data),
    serverData: JSON.parse(r.server_data),
    detectedAt: r.detected_at,
    resolvedAt: r.resolved_at,
  };
}

/**
 * Records (or refreshes) the unresolved conflict for this entity. At most
 * one unresolved conflict exists per (uid, entityType, entityId) — a second
 * detection before the user resolves the first just updates the payloads
 * rather than stacking duplicate rows.
 */
export async function recordConflict(
  db: SqlExecutor,
  input: Pick<ConflictRecord, 'uid' | 'entityType' | 'entityId' | 'localData' | 'serverData'>
): Promise<string> {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM conflicts WHERE uid = ? AND entity_type = ? AND entity_id = ? AND resolved_at IS NULL`,
    [input.uid, input.entityType, input.entityId]
  );
  const id = existing?.id ?? randomId();
  const now = new Date().toISOString();

  if (existing) {
    await db.runAsync(
      'UPDATE conflicts SET local_data = ?, server_data = ?, detected_at = ? WHERE id = ?',
      [JSON.stringify(input.localData), JSON.stringify(input.serverData), now, id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO conflicts (id, uid, entity_type, entity_id, local_data, server_data, detected_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [id, input.uid, input.entityType, input.entityId, JSON.stringify(input.localData), JSON.stringify(input.serverData), now]
    );
  }
  return id;
}

export async function listUnresolved(db: SqlExecutor, uid: string): Promise<ConflictRecord[]> {
  const rows = await db.getAllAsync<Raw>(
    'SELECT * FROM conflicts WHERE uid = ? AND resolved_at IS NULL ORDER BY detected_at ASC',
    [uid]
  );
  return rows.map(fromRow);
}

export async function getConflict(db: SqlExecutor, id: string): Promise<ConflictRecord | null> {
  const row = await db.getFirstAsync<Raw>('SELECT * FROM conflicts WHERE id = ?', [id]);
  return row ? fromRow(row) : null;
}

/** Marks a conflict resolved. Does not touch entity/outbox tables — the caller applies the chosen data first. */
export async function resolveConflict(db: SqlExecutor, id: string): Promise<void> {
  await db.runAsync('UPDATE conflicts SET resolved_at = ? WHERE id = ?', [
    new Date().toISOString(),
    id,
  ]);
}
