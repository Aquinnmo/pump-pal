import assert from 'node:assert/strict';
import {
  decideAccountBootstrap,
  initialSyncOutcomeFromError,
  initialSyncOutcomeFromSync,
} from './initial-sync';

const uid = 'user-1';
const profileWithSplit = {
  workoutSplit: { type: 'Upper / Lower' as const, custom: null, updatedAt: '2026-08-05T00:00:00.000Z' },
  username: 'athlete1',
};

async function main() {
  // Existing local state remains usable without a successful network bootstrap.
  assert.deepEqual(
    decideAccountBootstrap(profileWithSplit, null, initialSyncOutcomeFromError(uid, new Error('fetch failed'))),
    { state: 'ready', source: 'cached' }
  );

  // A successful remote pull can open the app once it writes the profile locally.
  assert.deepEqual(
    decideAccountBootstrap(null, profileWithSplit, initialSyncOutcomeFromSync(uid, { status: 'ok', pushed: 0, pulled: 1, remoteDeletions: 0 })),
    { state: 'ready', source: 'remote' }
  );

  // This is the only path to onboarding: a completed, authoritative read with no username/split.
  // Username clears first when both are missing.
  assert.deepEqual(
    decideAccountBootstrap(null, null, initialSyncOutcomeFromSync(uid, { status: 'ok', pushed: 0, pulled: 0, remoteDeletions: 0 })),
    { state: 'onboarding', step: 'username' }
  );

  // A username with no split still routes to the split step.
  assert.deepEqual(
    decideAccountBootstrap(
      null,
      { username: 'athlete1' },
      initialSyncOutcomeFromSync(uid, { status: 'ok', pushed: 0, pulled: 0, remoteDeletions: 0 })
    ),
    { state: 'onboarding', step: 'split' }
  );

  for (const outcome of [
    initialSyncOutcomeFromSync(uid, { status: 'auth-required' }),
    initialSyncOutcomeFromSync(uid, { status: 'rate-limited', retryAfterMs: null }),
    initialSyncOutcomeFromSync(uid, { status: 'partial', pushed: 0, reason: 'cancelled' }),
    initialSyncOutcomeFromError(uid, new Error('fetch failed')),
    initialSyncOutcomeFromError(uid, new Error('unexpected sync failure')),
  ]) {
    const decision = decideAccountBootstrap(null, null, outcome);
    assert.equal(decision.state, 'error');
  }

  assert.deepEqual(
    decideAccountBootstrap(null, null, { kind: 'auth-transition', uid }),
    { state: 'pending' }
  );

  assert.equal(initialSyncOutcomeFromError(uid, new Error('Could not reach API: ENOTFOUND')).kind, 'offline');
  console.log('src/data/initial-sync.test.ts: all assertions passed');
}

main();
