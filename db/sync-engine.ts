// Native sync engine core. Platform-free (only SqlExecutor + injected
// adapters), so it's testable with node:sqlite + a fake in-memory server —
// see db/sync-engine.test.ts. db/sync.ts binds this to the real db/client.ts
// and repositories/remote/*.ts for app use.
//
// One run = push phase (drain the outbox, oldest first, bounded) then pull
// phase (fetch the full manifest, diff against local, batch-pull what's
// stale/missing). A v1 full manifest, not an incremental log, per the epic's
// design note (legacy direct-Firestore writers may still exist during the
// migration grace period and would bypass a change log).
import { SqlExecutor } from './executor';
import { claimPending, release, releaseStaleClaims, acknowledge, recordRetry, OutboxRow } from './outbox';
import { recordConflict } from './conflicts';
import { setSyncCursor } from './sync-cursors';

export class SyncAuthError extends Error {}
export class SyncConflictError extends Error {
  constructor(message: string, public remote: unknown, public remoteVersion: string) {
    super(message);
  }
}
export class SyncRateLimitError extends Error {
  constructor(message: string, public retryAfterMs: number | null) {
    super(message);
  }
}
export class SyncNotFoundError extends Error {}

export type LocalRow = {
  id: string;
  syncState: 'synced' | 'dirty' | 'conflict';
  serverVersion: string | null;
  data: unknown;
};

export type EntityAdapter = {
  /** Local outbox entityType, e.g. 'workout'. */
  entityType: string;
  /** Wire manifest `kind`, e.g. 'workout' (shared/api-contract.ts SYNCABLE_KINDS) — may differ from entityType. */
  /** Absent for outbox-only entities such as pending catalog submissions. */
  wireKind?: string;
  local: {
    getAllRows(db: SqlExecutor, uid: string): Promise<LocalRow[]>;
    /** Upsert-by-id with server-authoritative data — never touches the outbox. */
    writeSynced(db: SqlExecutor, uid: string, id: string, data: unknown, version: string): Promise<void>;
    removeClean(db: SqlExecutor, uid: string, id: string): Promise<void>;
    markConflict(db: SqlExecutor, uid: string, id: string): Promise<void>;
  };
  remote: {
    create(payload: unknown, id: string, signal?: AbortSignal): Promise<{ version: string; data: unknown }>;
    update(
      id: string,
      payload: unknown,
      baseVersion: string | null,
      signal?: AbortSignal
    ): Promise<{ version: string; data: unknown }>;
    delete(id: string, baseVersion: string | null, signal?: AbortSignal): Promise<void>;
  };
};

export type ManifestEntry = { kind: string; id: string; version: string };

export type SyncRemote = {
  manifest(
    uid: string,
    cursor: string | undefined,
    signal?: AbortSignal
  ): Promise<{ items: ManifestEntry[]; nextCursor: string | null }>;
  pull(
    entities: { kind: string; id: string; version?: string }[],
    signal?: AbortSignal
  ): Promise<{ found: { kind: string; id: string; version: string; data: unknown }[]; missing: { kind: string; id: string }[] }>;
};

export type SyncOptions = {
  maxOutboxItems?: number;
  maxManifestPages?: number;
  pullBatchSize?: number;
  signal?: AbortSignal;
  /** Exposed for deterministic tests; production uses real exponential backoff + jitter. */
  computeBackoffMs?: (attempts: number) => number;
};

export type SyncOutcome =
  | { status: 'ok'; pushed: number; pulled: number; conflicts: number; remoteDeletions: number }
  | { status: 'auth-required' }
  | { status: 'rate-limited'; retryAfterMs: number | null }
  | { status: 'partial'; pushed: number; reason: 'max-outbox-items' | 'cancelled' };

const DEFAULT_MAX_OUTBOX_ITEMS = 100;
const DEFAULT_MANIFEST_PAGES = 50;
const DEFAULT_PULL_BATCH = 200; // matches shared/api-contract.ts pullRequest's max

function defaultBackoffMs(attempts: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempts);
  return base + Math.floor(Math.random() * 1000); // jitter
}

async function dispatchOne(
  db: SqlExecutor,
  uid: string,
  row: OutboxRow,
  adapter: EntityAdapter,
  signal?: AbortSignal
): Promise<void> {
  if (row.op === 'create') {
    const { version, data } = await adapter.remote.create(row.payload, row.entityId, signal);
    await adapter.local.writeSynced(db, uid, row.entityId, data, version);
  } else if (row.op === 'update') {
    const { version, data } = await adapter.remote.update(
      row.entityId,
      row.payload,
      row.baseVersion,
      signal
    );
    await adapter.local.writeSynced(db, uid, row.entityId, data, version);
  } else {
    await adapter.remote.delete(row.entityId, row.baseVersion, signal);
    // A synced tombstone leaves no local trace to reconcile later — the row
    // is simply gone, same end state as removeClean's manifest-driven path.
    await adapter.local.removeClean(db, uid, row.entityId);
  }
}

/** Push phase: drains ready outbox rows for one entityType, oldest first, bounded. */
async function pushEntity(
  db: SqlExecutor,
  uid: string,
  adapter: EntityAdapter,
  budget: number,
  opts: SyncOptions
): Promise<{
  pushed: number;
  conflicts: number;
  outcome: 'drained' | 'auth-required' | 'rate-limited' | 'budget-exhausted' | 'cancelled';
  retryAfterMs?: number | null;
}> {
  let pushed = 0;
  let conflicts = 0;

  // One claim, one pass. Deliberately not a loop that reclaims after a
  // failure: a row that fails gets recordRetry'd with a backoff, but even
  // with zero backoff (tests) reclaiming it again *within the same run*
  // would spin on a persistently-failing item instead of bounding the work
  // and letting the next scheduled run (bead pump-pal-bkp.7's triggers) pick
  // it back up.
  if (opts.signal?.aborted) return { pushed, conflicts, outcome: 'cancelled' };
  const batch = await claimPending(db, uid, budget);
  const rows = batch.filter((r) => r.entityType === adapter.entityType);
  // Release claims on rows belonging to other entity types — this pass isn't theirs to hold.
  for (const r of batch) if (r.entityType !== adapter.entityType) await release(db, r.id);

  for (const row of rows) {
    try {
      await dispatchOne(db, uid, row, adapter, opts.signal);
      await acknowledge(db, row.id);
      pushed++;
    } catch (err) {
      if (err instanceof SyncConflictError) {
        const serverData = err.remote && typeof err.remote === 'object'
          ? { ...(err.remote as Record<string, unknown>), version: err.remoteVersion }
          : err.remote;
        await recordConflict(db, {
          uid,
          entityType: adapter.entityType,
          entityId: row.entityId,
          localData: row.payload,
          serverData,
        });
        await adapter.local.markConflict(db, uid, row.entityId);
        await acknowledge(db, row.id); // superseded by the conflict record — retrying the same stale write would just conflict again
        conflicts++;
      } else if (err instanceof SyncAuthError) {
        await release(db, row.id);
        return { pushed, conflicts, outcome: 'auth-required' };
      } else if (err instanceof SyncRateLimitError) {
        await release(db, row.id);
        return { pushed, conflicts, outcome: 'rate-limited', retryAfterMs: err.retryAfterMs };
      } else {
        // Anything else (network blip, timeout, transient 5xx, or even a
        // real validation bug) is retry-scheduled rather than dropped, so
        // a persistently-bad payload surfaces via repeated failures
        // instead of silently vanishing.
        // ponytail: no dead-letter/give-up threshold — `attempts` is
        // tracked but nothing acts on it yet; add one if a bad payload
        // ever needs to stop retrying forever.
        const backoff = opts.computeBackoffMs ?? defaultBackoffMs;
        await recordRetry(
          db,
          row.id,
          String((err as Error)?.message ?? err),
          new Date(Date.now() + backoff(row.attempts)).toISOString()
        );
      }
    }
  }
  return { pushed, conflicts, outcome: rows.length >= budget ? 'budget-exhausted' : 'drained' };
}

/** Pull phase: full-manifest diff against local rows for one entity kind. */
async function pullEntity(
  db: SqlExecutor,
  uid: string,
  adapter: EntityAdapter,
  manifestByKind: Map<string, ManifestEntry>,
  remote: SyncRemote,
  opts: SyncOptions
): Promise<{ pulled: number; conflicts: number; remoteDeletions: number }> {
  const localRows = await adapter.local.getAllRows(db, uid);
  const localById = new Map(localRows.map((r) => [r.id, r]));

  const needsPull: string[] = [];
  let conflicts = 0;
  let remoteDeletions = 0;

  for (const row of localRows) {
    const manifestEntry = manifestByKind.get(row.id);
    if (row.syncState === 'synced') {
      if (!manifestEntry) {
        await adapter.local.removeClean(db, uid, row.id);
        remoteDeletions++;
      } else if (manifestEntry.version !== row.serverVersion) {
        needsPull.push(row.id);
      }
    } else if (row.syncState === 'dirty' && row.serverVersion) {
      // Previously synced, now both locally dirty AND absent remotely — a
      // real conflict (dirty remote deletion), never silently dropped.
      if (!manifestEntry) {
        await recordConflict(db, {
          uid,
          entityType: adapter.entityType,
          entityId: row.id,
          localData: row.data,
          serverData: null,
        });
        await adapter.local.markConflict(db, uid, row.id);
        conflicts++;
      }
    }
    // dirty-with-no-serverVersion (never synced) or already-conflict rows:
    // left alone, nothing new to reconcile from the manifest this pass.
  }

  for (const [id, entry] of manifestByKind) {
    if (entry.kind !== adapter.wireKind) continue;
    if (!localById.has(id)) needsPull.push(id);
  }

  let pulled = 0;
  const batchSize = opts.pullBatchSize ?? DEFAULT_PULL_BATCH;
  for (let i = 0; i < needsPull.length; i += batchSize) {
    if (opts.signal?.aborted) break;
    const batch = needsPull.slice(i, i + batchSize).map((id) => ({ kind: adapter.wireKind!, id, version: manifestByKind.get(id)?.version }));
    const { found, missing } = await remote.pull(batch, opts.signal);
    for (const item of found) {
      if (item.kind !== adapter.wireKind) continue;
      await adapter.local.writeSynced(db, uid, item.id, item.data, item.version);
      pulled++;
    }
    for (const item of missing) {
      if (item.kind !== adapter.wireKind) continue;
      if (localById.has(item.id)) {
        await adapter.local.removeClean(db, uid, item.id);
        remoteDeletions++;
      }
    }
  }

  return { pulled, conflicts, remoteDeletions };
}

async function fetchFullManifest(
  remote: SyncRemote,
  uid: string,
  opts: SyncOptions
): Promise<Map<string, ManifestEntry>> {
  const byId = new Map<string, ManifestEntry>();
  let cursor: string | undefined;
  let pages = 0;
  const maxPages = opts.maxManifestPages ?? DEFAULT_MANIFEST_PAGES;
  do {
    if (opts.signal?.aborted) break;
    const page = await remote.manifest(uid, cursor, opts.signal);
    for (const entry of page.items) byId.set(entry.id, entry);
    cursor = page.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < maxPages);
  return byId;
}

/**
 * Runs one full sync pass for `uid` across every adapter in `adapters`.
 * Caller (db/sync.ts) is responsible for: serializing runs per uid (one
 * mutex), and never invoking this for a signed-out or different uid than the
 * currently authenticated Firebase user.
 */
export async function runSync(
  db: SqlExecutor,
  uid: string,
  adapters: EntityAdapter[],
  remote: SyncRemote,
  opts: SyncOptions = {}
): Promise<SyncOutcome> {
  // Runs are serialized per uid by the caller (one mutex) — any outbox row
  // still marked claimed at the start of a run can only be a leftover from a
  // run that crashed before it could release/acknowledge, never a
  // concurrent one. Reclaim unconditionally so it isn't stuck forever.
  await releaseStaleClaims(db, uid, 0);

  let totalPushed = 0;
  let totalConflicts = 0;

  const budgetPerAdapter = Math.ceil((opts.maxOutboxItems ?? DEFAULT_MAX_OUTBOX_ITEMS) / adapters.length);
  for (const adapter of adapters) {
    const result = await pushEntity(db, uid, adapter, budgetPerAdapter, opts);
    totalPushed += result.pushed;
    totalConflicts += result.conflicts;
    if (result.outcome === 'auth-required') return { status: 'auth-required' };
    if (result.outcome === 'rate-limited') {
      return { status: 'rate-limited', retryAfterMs: result.retryAfterMs ?? null };
    }
    if (result.outcome === 'cancelled') return { status: 'partial', pushed: totalPushed, reason: 'cancelled' };
    if (result.outcome === 'budget-exhausted') {
      return { status: 'partial', pushed: totalPushed, reason: 'max-outbox-items' };
    }
  }

  if (opts.signal?.aborted) return { status: 'partial', pushed: totalPushed, reason: 'cancelled' };

  const manifestByKind = await fetchFullManifest(remote, uid, opts);
  let totalPulled = 0;
  let totalRemoteDeletions = 0;
  for (const adapter of adapters) {
    if (!adapter.wireKind) continue;
    const result = await pullEntity(db, uid, adapter, manifestByKind, remote, opts);
    totalPulled += result.pulled;
    totalConflicts += result.conflicts;
    totalRemoteDeletions += result.remoteDeletions;
    await setSyncCursor(db, {
      uid,
      entityType: adapter.wireKind,
      lastSyncedAt: new Date().toISOString(),
      manifestVersion: null,
    });
  }

  return {
    status: 'ok',
    pushed: totalPushed,
    pulled: totalPulled,
    conflicts: totalConflicts,
    remoteDeletions: totalRemoteDeletions,
  };
}
