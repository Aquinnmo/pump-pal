// Native sync engine core. Platform-free (only SqlExecutor + injected
// adapters), so it's testable with node:sqlite + a fake in-memory server —
// see src/data/sync-engine.test.ts. src/data/sync.ts binds this to the real src/data/client.ts
// and repositories/remote/*.ts for app use.
//
// One run = push phase (drain the outbox, oldest first, bounded) then pull
// phase (fetch the full manifest, diff against local, batch-pull what's
// stale/missing). A v1 full manifest, not an incremental log, per the epic's
// design note (legacy direct-Firestore writers may still exist during the
// migration grace period and would bypass a change log).
import { SqlExecutor } from './executor';
import { claimPending, release, releaseStaleClaims, acknowledge, rebase, discardEntity, recordRetry, park, OutboxRow } from './outbox';
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
/** The server rejected this payload permanently (for example Rules or DTO validation). */
export class SyncPermanentError extends Error {}

export type LocalRow = {
  id: string;
  syncState: 'synced' | 'dirty';
  serverVersion: string | null;
  data: unknown;
};

export type EntityAdapter = {
  /** Local outbox entityType, e.g. 'workout'. */
  entityType: string;
  /** Wire manifest `kind`, e.g. 'workout' (packages/contract/src/api-contract.ts SYNCABLE_KINDS) — may differ from entityType. */
  /** Absent for outbox-only entities such as pending catalog submissions. */
  wireKind?: string;
  local: {
    getAllRows(db: SqlExecutor, uid: string): Promise<LocalRow[]>;
    /** Upsert-by-id with server-authoritative data — never touches the outbox. */
    writeSynced(db: SqlExecutor, uid: string, id: string, data: unknown, version: string): Promise<void>;
    removeClean(db: SqlExecutor, uid: string, id: string): Promise<void>;
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
  | { status: 'ok'; pushed: number; pulled: number; remoteDeletions: number }
  | { status: 'auth-required' }
  | { status: 'rate-limited'; retryAfterMs: number | null }
  | { status: 'permanent-failure'; entityType: string; entityId: string; message: string }
  | { status: 'partial'; pushed: number; reason: 'max-outbox-items' | 'cancelled' };

const DEFAULT_MAX_OUTBOX_ITEMS = 100;
const DEFAULT_MANIFEST_PAGES = 50;
const DEFAULT_PULL_BATCH = 200; // matches packages/contract/src/api-contract.ts pullRequest's max

function defaultBackoffMs(attempts: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempts);
  return base + Math.floor(Math.random() * 1000); // jitter
}

/**
 * Performs the remote call only. Applying the result to local state is the
 * caller's job, and must happen *after* acknowledge() confirms this run still
 * holds the row's claim — a local write landing during the round trip
 * supersedes this intent, and writing the server's response over it would
 * discard the user's newer edit.
 */
async function dispatchOne(
  db: SqlExecutor,
  uid: string,
  row: OutboxRow,
  adapter: EntityAdapter,
  signal?: AbortSignal
): Promise<{ version: string; data: unknown } | null> {
  if (row.op === 'create') {
    // A replayed offline create can discover that a prior attempt committed
    // just before the app was killed. Conflict handling rebases the row onto
    // that document's updateTime; the one local-wins retry must then be an
    // update, not another exists:false create.
    if (row.baseVersion) return adapter.remote.update(row.entityId, row.payload, row.baseVersion, signal);
    return adapter.remote.create(row.payload, row.entityId, signal);
  }
  if (row.op === 'update') {
    return adapter.remote.update(row.entityId, row.payload, row.baseVersion, signal);
  }
  await adapter.remote.delete(row.entityId, row.baseVersion, signal);
  return null;
}

/** Applies a dispatched intent's result to local state. Only safe once the claim is confirmed. */
async function applyDispatched(
  db: SqlExecutor,
  uid: string,
  row: OutboxRow,
  adapter: EntityAdapter,
  result: { version: string; data: unknown } | null
): Promise<void> {
  if (result) {
    await adapter.local.writeSynced(db, uid, row.entityId, result.data, result.version);
  } else {
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
  remoteDeletions: number;
  outcome: 'drained' | 'auth-required' | 'rate-limited' | 'permanent-failure' | 'budget-exhausted' | 'cancelled';
  retryAfterMs?: number | null;
  permanentFailure?: { entityType: string; entityId: string; message: string };
}> {
  let pushed = 0;
  let remoteDeletions = 0;

  // One claim, one pass. Deliberately not a loop that reclaims after a
  // failure: a row that fails gets recordRetry'd with a backoff, but even
  // with zero backoff (tests) reclaiming it again *within the same run*
  // would spin on a persistently-failing item instead of bounding the work
  // and letting the next scheduled run (bead pump-pal-bkp.7's triggers) pick
  // it back up.
  if (opts.signal?.aborted) return { pushed, remoteDeletions, outcome: 'cancelled' };
  const batch = await claimPending(db, uid, budget);
  const rows = batch.filter((r) => r.entityType === adapter.entityType);
  // Release claims on rows belonging to other entity types — this pass isn't theirs to hold.
  for (const r of batch) if (r.entityType !== adapter.entityType) await release(db, r.id);

  /** Applies a dispatched intent's outcome to local state, honouring the claim token. */
  const finalize = async (row: OutboxRow, result: { version: string; data: unknown } | null) => {
    if (await acknowledge(db, row.id, row.claimedAt)) {
      await applyDispatched(db, uid, row, adapter, result);
    } else if (result) {
      // A local write landed mid-round-trip and superseded this intent.
      // Leave the entity row alone — it holds the user's newer data — and
      // rebase the surviving outbox row onto the version the server just
      // wrote. The entity row's now-stale server_version is harmless: it is
      // only read to seed a *new* intent's baseVersion, and coalesce()
      // keeps the existing (just-rebased) row's value instead.
      await rebase(db, row.id, result.version);
    }
  };

  for (const row of rows) {
    try {
      let current = row;
      let result: { version: string; data: unknown } | null;
      try {
        result = await dispatchOne(db, uid, current, adapter, opts.signal);
      } catch (err) {
        if (!(err instanceof SyncConflictError)) throw err;
        // Local wins, automatically. The server moved on, so re-aim at the
        // version it reports and push the same local payload straight over
        // it. One retry, not a loop — a second rejection means yet another
        // writer landed mid-run, and the outer catch's backoff lets the next
        // scheduled run start from the version this one just learned about.
        current = { ...current, baseVersion: err.remoteVersion };
        await rebase(db, current.id, err.remoteVersion);
        result = await dispatchOne(db, uid, current, adapter, opts.signal);
      }
      await finalize(current, result);
      pushed++;
    } catch (err) {
      // A 404 is deliberately NOT treated as "deleted on another device". Any
      // hop in the network path can produce one — a route that isn't deployed
      // returns the same status as a record that doesn't exist — and acting on
      // it here would delete the user's local row on an infrastructure fault.
      // The pull phase below detects a real remote deletion from the manifest,
      // which is evidence the server itself no longer lists the record, and it
      // does so in the same run. So a 404 just takes the retry path.
      if (err instanceof SyncAuthError) {
        await release(db, row.id);
        return { pushed, remoteDeletions, outcome: 'auth-required' };
      } else if (err instanceof SyncRateLimitError) {
        await release(db, row.id);
        return { pushed, remoteDeletions, outcome: 'rate-limited', retryAfterMs: err.retryAfterMs };
      } else if (err instanceof SyncPermanentError) {
        await park(db, row.id, err.message);
        return {
          pushed,
          remoteDeletions,
          outcome: 'permanent-failure',
          permanentFailure: { entityType: row.entityType, entityId: row.entityId, message: err.message },
        };
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
  return { pushed, remoteDeletions, outcome: rows.length >= budget ? 'budget-exhausted' : 'drained' };
}

/** Pull phase: full-manifest diff against local rows for one entity kind. */
async function pullEntity(
  db: SqlExecutor,
  uid: string,
  adapter: EntityAdapter,
  manifestByKind: Map<string, ManifestEntry>,
  remote: SyncRemote,
  opts: SyncOptions
): Promise<{ pulled: number; remoteDeletions: number }> {
  const localRows = await adapter.local.getAllRows(db, uid);
  const localById = new Map(localRows.map((r) => [r.id, r]));

  const needsPull: string[] = [];
  let remoteDeletions = 0;
  const manifestKey = (id: string) => `${adapter.wireKind}:${id}`;

  for (const row of localRows) {
    const manifestEntry = manifestByKind.get(manifestKey(row.id));
    if (row.syncState === 'synced') {
      if (!manifestEntry) {
        await adapter.local.removeClean(db, uid, row.id);
        remoteDeletions++;
      } else if (manifestEntry.version !== row.serverVersion) {
        needsPull.push(row.id);
      }
    } else if (row.syncState === 'dirty' && row.serverVersion) {
      // Previously synced, now both locally dirty AND absent remotely: it was
      // deleted on another device. Accept that rather than resurrecting it —
      // a delete is an explicit action there, and re-creating it would make
      // deleted records keep reappearing. The queued intent goes too, or it
      // would 404 on every subsequent run.
      if (!manifestEntry) {
        await adapter.local.removeClean(db, uid, row.id);
        await discardEntity(db, uid, adapter.entityType, row.id);
        remoteDeletions++;
      }
    }
    // dirty-with-no-serverVersion (never synced): left alone, nothing to
    // reconcile from the manifest this pass.
  }

  for (const entry of manifestByKind.values()) {
    if (entry.kind !== adapter.wireKind) continue;
    if (!localById.has(entry.id)) needsPull.push(entry.id);
  }

  let pulled = 0;
  const batchSize = opts.pullBatchSize ?? DEFAULT_PULL_BATCH;
  for (let i = 0; i < needsPull.length; i += batchSize) {
    if (opts.signal?.aborted) break;
    const batch = needsPull.slice(i, i + batchSize).map((id) => ({ kind: adapter.wireKind!, id, version: manifestByKind.get(manifestKey(id))?.version }));
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

  return { pulled, remoteDeletions };
}

async function fetchFullManifest(
  remote: SyncRemote,
  uid: string,
  opts: SyncOptions
): Promise<Map<string, ManifestEntry>> {
  // Keyed by `kind:id`, not id — `profile` and `pushupChallenge` are both
  // emitted with id = uid, so an id-only key silently drops one of them.
  const byId = new Map<string, ManifestEntry>();
  let cursor: string | undefined;
  let pages = 0;
  const maxPages = opts.maxManifestPages ?? DEFAULT_MANIFEST_PAGES;
  do {
    if (opts.signal?.aborted) break;
    const page = await remote.manifest(uid, cursor, opts.signal);
    for (const entry of page.items) byId.set(`${entry.kind}:${entry.id}`, entry);
    cursor = page.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < maxPages);
  return byId;
}

/**
 * Runs one full sync pass for `uid` across every adapter in `adapters`.
 * Caller (src/data/sync.ts) is responsible for: serializing runs per uid (one
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
  //
  // ponytail: that premise holds only within one JS runtime — the serializer
  // is createKeyedMutex (src/data/sync.ts), which is an in-memory Map. A headless
  // task with its own runtime (src/lib/wear-action-task.ts writes the same
  // active workout) could run concurrently, and this call would steal its
  // claims. Unverified and not fixed here; the upgrade path is a DB-level
  // lock rather than an in-process one.
  await releaseStaleClaims(db, uid, 0);

  let totalPushed = 0;
  let totalRemoteDeletions = 0;

  const budgetPerAdapter = Math.ceil((opts.maxOutboxItems ?? DEFAULT_MAX_OUTBOX_ITEMS) / adapters.length);
  for (const adapter of adapters) {
    const result = await pushEntity(db, uid, adapter, budgetPerAdapter, opts);
    totalPushed += result.pushed;
    totalRemoteDeletions += result.remoteDeletions;
    if (result.outcome === 'auth-required') return { status: 'auth-required' };
    if (result.outcome === 'rate-limited') {
      return { status: 'rate-limited', retryAfterMs: result.retryAfterMs ?? null };
    }
    if (result.outcome === 'permanent-failure') {
      return { status: 'permanent-failure', ...(result.permanentFailure ?? { entityType: adapter.entityType, entityId: '', message: 'Sync was rejected.' }) };
    }
    if (result.outcome === 'cancelled') return { status: 'partial', pushed: totalPushed, reason: 'cancelled' };
    if (result.outcome === 'budget-exhausted') {
      return { status: 'partial', pushed: totalPushed, reason: 'max-outbox-items' };
    }
  }

  if (opts.signal?.aborted) return { status: 'partial', pushed: totalPushed, reason: 'cancelled' };

  const manifestByKind = await fetchFullManifest(remote, uid, opts);
  let totalPulled = 0;
  for (const adapter of adapters) {
    if (!adapter.wireKind) continue;
    const result = await pullEntity(db, uid, adapter, manifestByKind, remote, opts);
    totalPulled += result.pulled;
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
    remoteDeletions: totalRemoteDeletions,
  };
}
