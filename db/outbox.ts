// Durable, coalesced mutation outbox — see docs/data-model/README.md-adjacent
// design note in the epic: "Native writes update the local entity and
// coalesced outbox intent atomically." One pending row per (uid, entityType,
// entityId), enforced by the unique index in db/schema.ts.
//
// Repository callers (bead pump-pal-bkp.2/.3) call `enqueue` inside the same
// `withTransactionAsync` block that writes the entity table, so a crash
// never leaves an entity mutated without a matching outbox intent or vice
// versa. The sync engine (bead pump-pal-bkp.6) calls claim/release/
// acknowledge/recordRetry; nothing here talks to the network.
import { SqlExecutor } from './executor';
import { randomId } from './id';

export type OutboxOp = 'create' | 'update' | 'delete';

export type OutboxIntent = {
  uid: string;
  entityType: string;
  entityId: string;
  op: OutboxOp;
  /** Full entity snapshot for create/update; ignored (stored as null) for delete. */
  payload: unknown;
  /** Server version this intent was based on; null if the entity was never synced. */
  baseVersion: string | null;
};

export type OutboxRow = OutboxIntent & {
  id: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  claimedAt: string | null;
  nextAttemptAt: string | null;
};

type Raw = {
  id: string;
  uid: string;
  entity_type: string;
  entity_id: string;
  op: OutboxOp;
  payload: string;
  base_version: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  next_attempt_at: string | null;
};

function fromRow(r: Raw): OutboxRow {
  return {
    id: r.id,
    uid: r.uid,
    entityType: r.entity_type,
    entityId: r.entity_id,
    op: r.op,
    payload: r.payload === 'null' ? null : JSON.parse(r.payload),
    baseVersion: r.base_version,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    claimedAt: r.claimed_at,
    nextAttemptAt: r.next_attempt_at,
  };
}

/**
 * Merges a new intent onto whatever is already queued for this entity.
 * Returns null when the net effect is "nothing to sync" (a create that was
 * never synced, then locally deleted). baseVersion always comes from the
 * *first* queued intent — later local edits must not silently change what
 * the sync engine treats as the divergence point.
 */
export function coalesce(
  existing: Pick<OutboxIntent, 'op' | 'baseVersion'> | null,
  incoming: Pick<OutboxIntent, 'op' | 'payload' | 'baseVersion'>
): { op: OutboxOp; payload: unknown; baseVersion: string | null } | null {
  if (!existing) {
    return { op: incoming.op, payload: incoming.payload, baseVersion: incoming.baseVersion };
  }
  if (existing.op === 'create') {
    // Never synced — a delete cancels it outright, an update just replaces the payload.
    if (incoming.op === 'delete') return null;
    return { op: 'create', payload: incoming.payload, baseVersion: existing.baseVersion };
  }
  if (existing.op === 'update') {
    if (incoming.op === 'delete') {
      return { op: 'delete', payload: null, baseVersion: existing.baseVersion };
    }
    return { op: 'update', payload: incoming.payload, baseVersion: existing.baseVersion };
  }
  // existing.op === 'delete': a create/update after a queued delete means the
  // record is back — the server still has the pre-delete row, so this reads
  // as an update against the original baseVersion, not a fresh create.
  if (incoming.op === 'create' || incoming.op === 'update') {
    return { op: 'update', payload: incoming.payload, baseVersion: existing.baseVersion };
  }
  return { op: 'delete', payload: null, baseVersion: existing.baseVersion };
}

/** Enqueues (or coalesces into an existing) outbox intent. Call inside the entity's own transaction. */
export async function enqueue(db: SqlExecutor, intent: OutboxIntent): Promise<void> {
  const existing = await db.getFirstAsync<Raw>(
    'SELECT * FROM outbox WHERE uid = ? AND entity_type = ? AND entity_id = ?',
    [intent.uid, intent.entityType, intent.entityId]
  );
  const merged = coalesce(existing ? fromRow(existing) : null, intent);

  // Single atomic statement (upsert-by-id) rather than delete-then-insert —
  // two separate statements outside a transaction could lose the row if the
  // app is killed between them, which would silently drop a queued mutation.
  if (!merged) {
    if (existing) await db.runAsync('DELETE FROM outbox WHERE id = ?', [existing.id]);
    return;
  }

  await db.runAsync(
    `INSERT INTO outbox (id, uid, entity_type, entity_id, op, payload, base_version, created_at, attempts, last_error, claimed_at, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET
       op = excluded.op,
       payload = excluded.payload,
       base_version = excluded.base_version`,
    [
      existing?.id ?? randomId(),
      intent.uid,
      intent.entityType,
      intent.entityId,
      merged.op,
      JSON.stringify(merged.payload),
      merged.baseVersion,
      existing?.created_at ?? new Date().toISOString(),
    ]
  );
}

/** Marks up to `limit` unclaimed, due rows as claimed and returns them, oldest first. */
export async function claimPending(
  db: SqlExecutor,
  uid: string,
  limit = 25
): Promise<OutboxRow[]> {
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<Raw>(
    `SELECT * FROM outbox
     WHERE uid = ? AND claimed_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC LIMIT ?`,
    [uid, now, limit]
  );
  if (rows.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        await db.runAsync('UPDATE outbox SET claimed_at = ? WHERE id = ?', [now, row.id]);
      }
    });
  }
  return rows.map(fromRow);
}

/** Crash recovery: claims left dangling (app killed mid-sync) become claimable again. */
export async function releaseStaleClaims(
  db: SqlExecutor,
  uid: string,
  olderThanMs: number
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  // <=, not <: two claims within the same millisecond (common with
  // olderThanMs=0, e.g. sync-engine's unconditional reclaim-at-run-start)
  // must still count as "at least that old", not be skipped by a strict tie.
  await db.runAsync(
    'UPDATE outbox SET claimed_at = NULL WHERE uid = ? AND claimed_at IS NOT NULL AND claimed_at <= ?',
    [uid, cutoff]
  );
}

/** Releases a claim without touching retry state (e.g. sync aborted, not failed). */
export async function release(db: SqlExecutor, id: string): Promise<void> {
  await db.runAsync('UPDATE outbox SET claimed_at = NULL WHERE id = ?', [id]);
}

/** The server accepted this intent — remove it. Never partially acknowledges. */
export async function acknowledge(db: SqlExecutor, id: string): Promise<void> {
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

/** The server rejected/failed this intent — release the claim, bump attempts, schedule a retry. */
export async function recordRetry(
  db: SqlExecutor,
  id: string,
  error: string,
  nextAttemptAt: string
): Promise<void> {
  await db.runAsync(
    'UPDATE outbox SET claimed_at = NULL, attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?',
    [error, nextAttemptAt, id]
  );
}

export async function listAll(db: SqlExecutor, uid: string): Promise<OutboxRow[]> {
  const rows = await db.getAllAsync<Raw>('SELECT * FROM outbox WHERE uid = ? ORDER BY created_at ASC', [
    uid,
  ]);
  return rows.map(fromRow);
}
