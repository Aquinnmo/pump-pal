import assert from 'node:assert/strict';
import {
  getSyncStatus,
  setSyncStatus,
  subscribeSyncStatus,
  _resetSyncStatusForTests,
  statusFromOutcome,
  statusFromError,
} from './sync-status';

async function main() {
  // --- pub/sub: subscribers are notified with the merged status ---
  {
    _resetSyncStatusForTests();
    const seen: string[] = [];
    const unsubscribe = subscribeSyncStatus((s) => seen.push(s.state));
    setSyncStatus({ state: 'syncing' });
    setSyncStatus({ state: 'idle', lastSyncedAt: '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(seen, ['syncing', 'idle']);
    assert.equal(getSyncStatus().lastSyncedAt, '2026-01-01T00:00:00.000Z');
    unsubscribe();
    setSyncStatus({ state: 'error' });
    assert.deepEqual(seen, ['syncing', 'idle'], 'unsubscribed listener gets nothing further');
  }

  // --- statusFromOutcome: ok with no conflicts -> idle ---
  assert.deepEqual(statusFromOutcome({ status: 'ok', conflicts: 0 }, 0).state, 'idle');

  // --- statusFromOutcome: ok with conflicts -> conflict state, count carried through ---
  {
    const patch = statusFromOutcome({ status: 'ok', conflicts: 2 }, 0);
    assert.equal(patch.state, 'conflict');
    assert.equal(patch.conflictCount, 2);
  }

  // --- statusFromOutcome: auth-required -> error, human-readable message ---
  assert.equal(statusFromOutcome({ status: 'auth-required' }, 0).state, 'error');

  // --- statusFromOutcome: rate-limited -> error ---
  assert.equal(statusFromOutcome({ status: 'rate-limited', retryAfterMs: 5000 }, 0).state, 'error');

  // --- statusFromOutcome: partial -> stays idle (bounded run, not a failure), preserves prior conflict count ---
  {
    const patch = statusFromOutcome({ status: 'partial', reason: 'max-outbox-items' }, 3);
    assert.equal(patch.state, 'idle');
    assert.equal(patch.conflictCount, 3);
  }

  // --- statusFromError: network-shaped message -> offline, not a hard error ---
  assert.equal(statusFromError(new Error('Could not reach https://api: fetch failed')).state, 'offline');

  // --- statusFromError: anything else -> error ---
  assert.equal(statusFromError(new Error('unexpected null')).state, 'error');

  console.log('db/sync-status.test.ts: all assertions passed');
}

main();
