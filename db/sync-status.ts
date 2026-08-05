// Compact sync-status model for UI consumers (bead pump-pal-bkp.8's
// conflict/status surfaces). Platform-free pub/sub — no RN import — so
// db/sync-trigger.ts (which does import RN/NetInfo/TaskManager) can stay a
// thin binding layer and this piece stays unit-testable.
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';

export type SyncStatus = {
  state: SyncState;
  lastSyncedAt: string | null;
  lastError: string | null;
  conflictCount: number;
};

const INITIAL: SyncStatus = {
  state: 'idle',
  lastSyncedAt: null,
  lastError: null,
  conflictCount: 0,
};

let current: SyncStatus = INITIAL;
const listeners = new Set<(status: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return current;
}

export function setSyncStatus(patch: Partial<SyncStatus>): SyncStatus {
  current = { ...current, ...patch };
  for (const listener of listeners) listener(current);
  return current;
}

/** Returns an unsubscribe function. */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test/dev-only: resets to the initial idle state. */
export function _resetSyncStatusForTests(): void {
  current = INITIAL;
}

// Mirrors db/sync-engine.ts's SyncOutcome shape structurally (not imported —
// that module pulls in the whole engine; this file stays a leaf so anything
// can depend on sync status without depending on sync internals).
export type SyncOutcomeLike =
  | { status: 'ok'; conflicts: number }
  | { status: 'auth-required' }
  | { status: 'rate-limited'; retryAfterMs: number | null }
  | { status: 'partial'; reason: string };

/** Pure mapping from a completed run's outcome to the next status — no I/O, easy to test exhaustively. */
export function statusFromOutcome(outcome: SyncOutcomeLike, previousConflictCount: number): Partial<SyncStatus> {
  switch (outcome.status) {
    case 'ok':
      return {
        state: outcome.conflicts > 0 ? 'conflict' : 'idle',
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        conflictCount: outcome.conflicts,
      };
    case 'auth-required':
      return { state: 'error', lastError: 'Signed out — reconnect to sync.' };
    case 'rate-limited':
      return { state: 'error', lastError: 'Rate limited by the server.' };
    case 'partial':
      // Bounded run, more work queued for the next trigger — not a failure.
      return { state: 'idle', conflictCount: previousConflictCount };
  }
}

/** Maps an unexpected throw (network down, etc.) — a run that never even completed. */
export function statusFromError(err: unknown): Partial<SyncStatus> {
  const message = err instanceof Error ? err.message : String(err);
  const offline = /network|fetch|ENOTFOUND|ECONNREFUSED/i.test(message);
  return { state: offline ? 'offline' : 'error', lastError: message };
}
