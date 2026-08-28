import assert from 'node:assert/strict';
import type { AccountDeletionPhases } from './account.js';
import { deleteAccountDataWith } from './account.js';

const okPhases = {
  deleteWorkouts: async () => 3,
  deleteLegacyWorkouts: async () => 1,
  deleteInjuries: async () => 2,
  deletePrivateDocs: async () => {},
  deletePushupChallenge: async () => {},
  deleteFriendships: async () => 2,
  deleteUsernameReservation: async () => {},
  deleteUserDoc: async () => {},
};

type PhaseName = keyof AccountDeletionPhases;
const phaseOrder: PhaseName[] = [
  'deleteUsernameReservation',
  'deleteWorkouts',
  'deleteLegacyWorkouts',
  'deleteInjuries',
  'deletePrivateDocs',
  'deletePushupChallenge',
  'deleteFriendships',
  'deleteUserDoc',
];

function makePhases(failing?: PhaseName): { phases: AccountDeletionPhases; calls: PhaseName[] } {
  const calls: PhaseName[] = [];
  const run = <T>(name: PhaseName, value: T) => async (): Promise<T> => {
    calls.push(name);
    if (name === failing) throw new Error(`${name} failed`);
    return value;
  };

  return {
    calls,
    phases: {
      deleteWorkouts: run('deleteWorkouts', 3),
      deleteLegacyWorkouts: run('deleteLegacyWorkouts', 1),
      deleteInjuries: run('deleteInjuries', 2),
      deletePrivateDocs: run('deletePrivateDocs', undefined),
      deletePushupChallenge: run('deletePushupChallenge', undefined),
      deleteFriendships: run('deleteFriendships', 2),
      deleteUsernameReservation: run('deleteUsernameReservation', undefined),
      deleteUserDoc: run('deleteUserDoc', undefined),
    },
  };
}

function withoutConsoleErrors<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

// Full success: every phase's result is reported, partial is false.
{
  const suppressed = console.error;
  console.error = () => {};
  const result = await deleteAccountDataWith('uid1', okPhases);
  console.error = suppressed;
  assert.deepEqual(result, {
    deleted: { workouts: 3, legacyWorkouts: 1, pushupChallenge: true, friendships: 2, userDoc: true },
    partial: false,
  });
}

// One phase failing marks partial but doesn't stop the others from running
// -- idempotent retry semantics depend on every remaining phase still firing.
{
  const suppressed = console.error;
  console.error = () => {};
  const result = await deleteAccountDataWith('uid2', {
    ...okPhases,
    deleteLegacyWorkouts: async () => {
      throw new Error('boom');
    },
  });
  console.error = suppressed;
  assert.equal(result.partial, true);
  assert.equal(result.deleted.workouts, 3); // ran before the failure
  assert.equal(result.deleted.legacyWorkouts, 0); // failed phase's count stays at its zero-value
  assert.equal(result.deleted.pushupChallenge, true); // ran after the failure
  assert.equal(result.deleted.userDoc, true); // ran after the failure
}

// A failure in the LAST phase still reports every earlier phase's real result.
{
  const suppressed = console.error;
  console.error = () => {};
  const result = await deleteAccountDataWith('uid3', {
    ...okPhases,
    deleteUserDoc: async () => {
      throw new Error('boom');
    },
  });
  console.error = suppressed;
  assert.equal(result.partial, true);
  assert.equal(result.deleted.userDoc, false);
  assert.equal(result.deleted.workouts, 3);
  assert.equal(result.deleted.pushupChallenge, true);
  assert.equal(result.deleted.friendships, 2);
}

// The username reservation must run first: the real phase reads usernameLower
// from the user document before the final deleteUserDoc phase removes it.
{
  const { phases, calls } = makePhases();
  await deleteAccountDataWith('uid-order', phases);
  assert.deepEqual(calls, phaseOrder);
}

// Every independent phase reports partial and the later phases still run. The
// injuries/private-docs pair is intentionally handled separately below.
for (const failing of phaseOrder.filter((name) => name !== 'deleteInjuries')) {
  const { phases, calls } = makePhases(failing);
  const result = await withoutConsoleErrors(() => deleteAccountDataWith(`uid-${failing}`, phases));
  assert.equal(result.partial, true, `${failing} failure must mark the result partial`);
  assert.deepEqual(calls, phaseOrder);
}

// Injuries and private docs share one try: an injuries failure skips private
// docs, but the later pushup, friendship, and user phases still execute.
{
  const { phases, calls } = makePhases('deleteInjuries');
  const result = await withoutConsoleErrors(() => deleteAccountDataWith('uid-trust-domain', phases));
  assert.equal(result.partial, true);
  assert.deepEqual(calls, phaseOrder.filter((name) => name !== 'deletePrivateDocs'));
}

// Best-effort deletion always returns its response shape, even when every
// phase fails; the route can therefore return its stable 200 response with
// partial=true instead of turning a cleanup error into a server error.
{
  const { phases } = makePhases();
  const failingPhases = Object.fromEntries(
    phaseOrder.map((name) => [name, async (..._args: never[]) => {
      throw new Error(`${name} failed`);
    }])
  ) as unknown as AccountDeletionPhases;
  const result = await withoutConsoleErrors(() => deleteAccountDataWith('uid-all-failed', { ...phases, ...failingPhases }));
  assert.deepEqual(result.deleted, { workouts: 0, legacyWorkouts: 0, pushupChallenge: false, friendships: 0, userDoc: false });
  assert.equal(result.partial, true);
}

console.log('account: all assertions passed');
