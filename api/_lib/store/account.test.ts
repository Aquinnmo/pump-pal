import assert from 'node:assert/strict';
import { deleteAccountDataWith } from './account.js';

const okPhases = {
  deleteWorkouts: async () => 3,
  deleteLegacyWorkouts: async () => 1,
  deletePushupChallenge: async () => {},
  deleteUsernameReservation: async () => {},
  deleteUserDoc: async () => {},
};

// Full success: every phase's result is reported, partial is false.
{
  const suppressed = console.error;
  console.error = () => {};
  const result = await deleteAccountDataWith('uid1', okPhases);
  console.error = suppressed;
  assert.deepEqual(result, { deleted: { workouts: 3, legacyWorkouts: 1, pushupChallenge: true, userDoc: true }, partial: false });
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
}

console.log('account: all assertions passed');
