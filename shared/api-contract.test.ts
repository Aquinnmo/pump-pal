import assert from 'node:assert/strict';
import {
  catalogExerciseDTO,
  conflictResponse,
  createInjuryInput,
  createPendingExerciseInput,
  createWorkoutInput,
  errorResponse,
  injuryDTO,
  listResponse,
  performedSet,
  profilePatchInput,
  pullRequest,
  putPushupChallengeInput,
  reorderWorkoutsInput,
  updateWorkoutInput,
  workoutDTO,
} from './api-contract.js';

// ---- errors / conflict envelope ----
assert.equal(errorResponse.safeParse({ error: 'bad' }).success, true);
assert.equal(errorResponse.safeParse({}).success, false);

const conflict = conflictResponse(workoutDTO);
assert.equal(
  conflict.safeParse({ error: 'stale', code: 'conflict', remote: 'not-a-workout', remoteVersion: 'v1' }).success,
  false
);

// ---- Timestamp/sentinel types never leak onto the wire: reject non-ISO dates ----
assert.equal(
  createWorkoutInput.safeParse({
    id: 'w1',
    name: 'Push Day',
    date: 'not-a-date',
    status: 'completed',
  }).success,
  false
);
assert.equal(
  createWorkoutInput.safeParse({
    id: 'w1',
    name: 'Push Day',
    date: '2026-08-05T12:00:00Z',
    status: 'completed',
    performedExercises: [],
  }).success,
  true
);

// updateWorkoutInput requires baseVersion (versioned mutation)
assert.equal(updateWorkoutInput.safeParse({ name: 'Renamed' }).success, false);
assert.equal(updateWorkoutInput.safeParse({ name: 'Renamed', baseVersion: 'v2' }).success, true);

// performedSet: superset of fields, all optional except setNumber
assert.equal(performedSet.safeParse({ setNumber: 1, reps: 8, weight: 135 }).success, true);
assert.equal(performedSet.safeParse({ reps: 8 }).success, false); // missing setNumber

// ---- profile: allowlist rejects unknown/server-owned fields ----
assert.equal(
  profilePatchInput.safeParse({ workoutSplit: { type: 'Full Body', custom: null } }).success,
  true
);
assert.equal(profilePatchInput.safeParse({ workoutSplit: { type: 'Not A Split', custom: null } }).success, false);
// uid/aiUsage are not part of the input schema at all — extra keys are ignored by
// default zod object parsing, but the *type* still has no uid field to smuggle through.
assert.equal(Object.keys(profilePatchInput.shape).includes('uid'), false);
// Runtime proof, not just a type-level one: a spoofed uid in the raw body is
// dropped by parsing, never reaches parsed.data for the route to (mis)trust.
{
  const parsed = profilePatchInput.parse({ uid: 'someone-elses-uid', workoutSplit: { type: 'Full Body', custom: null } });
  assert.equal('uid' in parsed, false);
}

// ---- injuries ----
assert.equal(
  createInjuryInput.safeParse({
    id: 'inj1',
    bodyPart: 'shoulder',
    severity: 'moderate',
    status: 'ongoing',
    onsetDate: '2026-08-01T00:00:00Z',
  }).success,
  true
);
assert.equal(
  createInjuryInput.safeParse({ id: 'inj1', bodyPart: 'not-a-body-part', severity: 'moderate', onsetDate: '2026-08-01T00:00:00Z' })
    .success,
  false
);
assert.equal(injuryDTO.safeParse({ id: 'x' }).success, false); // missing required fields

// ---- catalog: pending submission never accepts createdBy/status from client ----
assert.equal(createPendingExerciseInput.safeParse({ name: 'Cable Fly' }).success, true);
assert.equal('createdBy' in createPendingExerciseInput.shape, false);
assert.equal('status' in createPendingExerciseInput.shape, false);
assert.equal(catalogExerciseDTO.safeParse({}).success, false);

// ---- reorder: bounded batch ----
assert.equal(reorderWorkoutsInput.safeParse({ order: [] }).success, false); // min 1
assert.equal(reorderWorkoutsInput.safeParse({ order: [{ id: 'w1', queueOrder: 0 }] }).success, true);

// ---- pushup challenge: desired-state replace ----
assert.equal(
  putPushupChallengeInput.safeParse({ startDate: '2026-08-01', days: [], longestStreak: 5 }).success,
  true
);
assert.equal(putPushupChallengeInput.safeParse({ startDate: '2026-08-01', days: [], longestStreak: -1 }).success, false);

// ---- sync pull: bounded batch, kind is a closed enum ----
assert.equal(pullRequest.safeParse({ entities: [] }).success, false); // min 1
assert.equal(pullRequest.safeParse({ entities: [{ kind: 'workout', id: 'w1' }] }).success, true);
assert.equal(pullRequest.safeParse({ entities: [{ kind: 'bogus', id: 'w1' }] }).success, false);

// ---- listResponse helper ----
const listedWorkouts = listResponse(workoutDTO);
assert.equal(listedWorkouts.safeParse({ items: [], nextCursor: null }).success, true);
assert.equal(listedWorkouts.safeParse({ items: [] }).success, false); // nextCursor required

console.log('api-contract: all assertions passed');
