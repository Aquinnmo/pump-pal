import assert from 'node:assert/strict';
import {
  catalogExerciseDTO,
  catalogResponse,
  conflictResponse,
  createInjuryInput,
  createPendingExerciseInput,
  createWorkoutInput,
  errorResponse,
  injuryDTO,
  listResponse,
  performedSet,
  directProfilePatchInput,
  profilePatchInput,
  profileResponse,
  pullRequest,
  pushupChallengeDTO,
  pushupChallengeResponse,
  putPushupChallengeInput,
  reorderWorkoutsInput,
  updateWorkoutInput,
  updateUsernameInput,
  workoutDTO,
  workoutResponse,
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
assert.deepEqual(
  directProfilePatchInput.parse({ workoutSplit: { type: 'Full Body', custom: null }, username: 'not-accepted-here' }),
  { workoutSplit: { type: 'Full Body', custom: null } }
);
assert.equal(updateUsernameInput.safeParse({ username: 'timber' }).success, true);
assert.equal(updateUsernameInput.safeParse({}).success, false);
// uid/aiUsage are not part of the input schema at all — extra keys are ignored by
// default zod object parsing, but the *type* still has no uid field to smuggle through.
assert.equal(Object.keys(profilePatchInput.shape).includes('uid'), false);
// Runtime proof, not just a type-level one: a spoofed uid in the raw body is
// dropped by parsing, never reaches parsed.data for the route to (mis)trust.
{
  const parsed = profilePatchInput.parse({ uid: 'someone-elses-uid', workoutSplit: { type: 'Full Body', custom: null } });
  assert.equal('uid' in parsed, false);
}
assert.equal(profileResponse.safeParse({ profile: { workoutSplit: null, username: null, aiUsage: null, version: 'v1' } }).success, true);
assert.equal(profileResponse.safeParse({ profile: null }).success, true);

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
const catalogExercise = {
  id: 'bench-press',
  name: 'Bench Press',
  normalizedName: 'bench press',
  aliases: [],
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  movementPattern: 'horizontal_press',
  equipment: ['barbell'],
  bodyRegion: 'upper',
  mechanics: 'compound',
  forceType: 'push',
  trackingModes: ['reps_weight'],
  variations: [],
  schemaVersion: 2,
};
assert.equal(catalogExerciseDTO.safeParse(catalogExercise).success, true);
assert.equal(catalogExerciseDTO.safeParse({ ...catalogExercise, schemaVersion: 1 }).success, false);
const { schemaVersion: _schemaVersion, ...legacyCatalogExercise } = catalogExercise;
assert.equal(catalogExerciseDTO.safeParse(legacyCatalogExercise).success, false);
assert.equal(catalogResponse.safeParse({ exercises: [catalogExercise], version: 1 }).success, true);
assert.equal(catalogResponse.safeParse({ exercises: [], version: 1 }).success, false);

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

// ---- mutation response envelopes ----
// Every single-entity endpoint wraps its DTO. A client declaring the bare DTO
// as its responseSchema parses NOTHING, and because the throw isn't a
// conflict/auth/rate-limit the sync engine retries it forever — which is
// exactly what shipped for workouts and the push-up challenge. The negative
// assertion is the one that catches it.
const validWorkout = {
  id: 'w1',
  name: 'Push Day',
  status: 'completed',
  date: '2026-08-05T12:00:00Z',
  performedExercises: [],
  createdAt: '2026-08-05T12:00:00Z',
  updatedAt: '2026-08-05T12:00:00Z',
  version: 'v1',
};
assert.equal(workoutDTO.safeParse(validWorkout).success, true);
assert.equal(workoutResponse.safeParse({ workout: validWorkout }).success, true);
assert.equal(workoutDTO.safeParse({ workout: validWorkout }).success, false);

const validChallenge = { startDate: '2026-08-05', days: [], longestStreak: 0, version: 'v1' };
assert.equal(pushupChallengeDTO.safeParse(validChallenge).success, true);
assert.equal(pushupChallengeResponse.safeParse({ challenge: validChallenge }).success, true);
assert.equal(pushupChallengeDTO.safeParse({ challenge: validChallenge }).success, false);

// The 409 envelope is the exception: `remote` is a BARE dto, which is why
// conflictEntitySchema on the client stays workoutDTO, not workoutResponse.
assert.equal(
  conflictResponse(workoutDTO).safeParse({
    error: 'stale', code: 'conflict', remote: validWorkout, remoteVersion: 'v2',
  }).success,
  true
);

// ---- listResponse helper ----
const listedWorkouts = listResponse(workoutDTO);
assert.equal(listedWorkouts.safeParse({ items: [], nextCursor: null }).success, true);
assert.equal(listedWorkouts.safeParse({ items: [] }).success, false); // nextCursor required

console.log('api-contract: all assertions passed');
