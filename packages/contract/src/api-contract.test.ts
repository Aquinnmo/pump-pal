import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buddyUid,
  buddyActionInput,
  buddyDTO,
  buddyRequestDTO,
  buddySearchResponse,
  buddySearchResult,
  buddyState,
  buddiesQuery,
  buddiesResponse,
  aiUsage,
  bodyPart,
  catalogExerciseDTO,
  catalogResponse,
  challengeDay,
  chopInput,
  chopResponse,
  conflictResponse,
  createInjuryInput,
  createPendingExerciseInput,
  createWorkoutInput,
  deleteAccountDataResponse,
  errorResponse,
  exerciseVariationDTO,
  injuryHistoryOpResponse,
  injuryDTO,
  injuryMutationResponse,
  injurySeverity,
  injurySide,
  injuryStatus,
  injuriesListResponse,
  isoTimestamp,
  listQuery,
  listResponse,
  listWorkoutsQuery,
  localDate,
  manifestEntry,
  manifestQuery,
  manifestResponse,
  performedExercise,
  performedSet,
  pullResponse,
  directProfilePatchInput,
  profilePatchInput,
  profileDTO,
  profileResponse,
  pullRequest,
  pushupChallengeDTO,
  pushupChallengeResponse,
  putPushupChallengeInput,
  reorderWorkoutsInput,
  sendBuddyRequestInput,
  splitOption,
  syncableKind,
  trackingMode,
  updateInjuryInput,
  updateWorkoutInput,
  updateUsernameInput,
  version,
  workoutSplit,
  workoutStatus,
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
// aiEnabled is owner-writable (opt-in toggle) but must stay a real boolean —
// a truthy string would sail past a `!!` check on the server and silently
// switch AI on for an account that never consented.
assert.deepEqual(directProfilePatchInput.parse({ aiEnabled: true }), { aiEnabled: true });
assert.equal(directProfilePatchInput.safeParse({ aiEnabled: 'yes' }).success, false);
assert.deepEqual(directProfilePatchInput.parse({ socialEnabled: false }), { socialEnabled: false });
assert.equal(directProfilePatchInput.safeParse({ socialEnabled: 'no' }).success, false);
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
assert.equal(profileResponse.safeParse({ profile: { workoutSplit: null, username: null, aiUsage: null, aiEnabled: null, socialEnabled: null, version: 'v1' } }).success, true);
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
const validWorkoutFixture = {
  id: 'w1',
  name: 'Push Day',
  status: 'completed',
  date: '2026-08-05T12:00:00Z',
  performedExercises: [],
  createdAt: '2026-08-05T12:00:00Z',
  updatedAt: '2026-08-05T12:00:00Z',
  version: 'v1',
};
assert.equal(workoutDTO.safeParse(validWorkoutFixture).success, true);
assert.equal(workoutResponse.safeParse({ workout: validWorkoutFixture }).success, true);
assert.equal(workoutDTO.safeParse({ workout: validWorkoutFixture }).success, false);

const validChallenge = { startDate: '2026-08-05', days: [], longestStreak: 0, version: 'v1' };
assert.equal(pushupChallengeDTO.safeParse(validChallenge).success, true);
assert.equal(pushupChallengeResponse.safeParse({ challenge: validChallenge }).success, true);
assert.equal(pushupChallengeDTO.safeParse({ challenge: validChallenge }).success, false);

// The 409 envelope is the exception: `remote` is a BARE dto, which is why
// conflictEntitySchema on the client stays workoutDTO, not workoutResponse.
assert.equal(
  conflictResponse(workoutDTO).safeParse({
    error: 'stale', code: 'conflict', remote: validWorkoutFixture, remoteVersion: 'v2',
  }).success,
  true
);

// ---- buddyUid: a Firestore path segment, not just any string ----
assert.equal(buddyUid.safeParse('a'.repeat(28)).success, true);
assert.equal(buddyUid.safeParse('ab/cd').success, false); // contains '/'
assert.equal(buddyUid.safeParse('ab_cd').success, false); // contains '_'

// ---- listResponse helper ----
const listedWorkouts = listResponse(workoutDTO);
assert.equal(listedWorkouts.safeParse({ items: [], nextCursor: null }).success, true);
assert.equal(listedWorkouts.safeParse({ items: [] }).success, false); // nextCursor required

console.log('api-contract: all assertions passed');

// ---------------------------------------------------------------------------
// Boundary matrix: every public schema gets at least one valid payload and a
// representative violation for each load-bearing constraint. These fixtures
// are intentionally small but complete; a refactor that makes a required
// field optional or widens an enum should fail here before reaching a client.

const iso = '2026-08-12T00:00:00Z';
const validSet = { setNumber: 1, reps: 8, weight: 135, rpe: 8 };
const validExercise = {
  order: 0,
  exerciseId: 'bench-press',
  exerciseRefPath: 'exercises/bench-press',
  exerciseNameSnapshot: 'Bench Press',
  variationId: null,
  variationNameSnapshot: null,
  sets: [validSet],
};
const validInjury = {
  id: 'inj-1', bodyPart: 'shoulder', side: 'left', muscles: ['deltoid'], severity: 'mild', status: 'ongoing',
  onsetDate: iso, resolvedDate: null, avoid: ['overhead press'], notes: 'watch form', createdAt: iso, updatedAt: iso,
};
const validWorkout = {
  id: 'w-1', name: 'Push Day', date: iso, status: 'completed', startedAt: iso, queueOrder: 1, notes: 'steady',
  performedExercises: [validExercise], injuries: ['inj-1'], createdAt: iso, updatedAt: iso, version: 'v1',
};
const validVariation = { id: 'wide', name: 'Wide Grip', aliases: [], primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'barbell' };
const validCatalog = {
  ...catalogExercise,
  variations: [validVariation],
  status: 'approved' as const,
};
const validBuddy = { uid: 'buddy1', username: 'Buddy', currentStreak: 2, longestStreak: 4, workedOutToday: false, lastChoppedAt: null };
const validRequest = { uid: 'buddy1', username: 'Buddy', direction: 'incoming' as const };
const validChallengeDay = { date: '2026-08-12', dayNumber: 1, completedAt: iso };

assert.equal(isoTimestamp.parse(iso), iso);
assert.equal(isoTimestamp.parse('2026-08-12T00:00:00+05:00'), '2026-08-12T00:00:00+05:00');
for (const value of ['2026-08-12T00:00:00', '2026-08-12']) assert.equal(isoTimestamp.safeParse(value).success, false);
assert.equal(version.parse('v1'), 'v1');
assert.equal(version.safeParse('').success, false);
assert.equal(splitOption.parse('Other'), 'Other');
assert.equal(splitOption.safeParse('active').success, false);
assert.deepEqual(workoutSplit.parse({ type: 'Other', custom: null }), { type: 'Other', custom: null });
assert.equal(workoutSplit.safeParse({ type: 'Other' }).success, false, 'custom is nullable but required');
assert.equal(aiUsage.safeParse({ date: '2026-08-12', count: -1 }).success, false);
assert.equal(aiUsage.safeParse({ date: '2026-08-12', count: 1.5 }).success, false);

const completeProfile = { workoutSplit: null, username: 'Timber', aiUsage: null, aiEnabled: false, socialEnabled: true, version: 'v1' };
assert.deepEqual(profileDTO.parse(completeProfile), completeProfile);
for (const key of ['workoutSplit', 'username', 'aiUsage', 'aiEnabled', 'socialEnabled', 'version']) {
  const missing = { ...completeProfile } as Record<string, unknown>;
  delete missing[key];
  assert.equal(profileDTO.safeParse(missing).success, false, `profileDTO must require ${key}`);
}
assert.equal(profileResponse.safeParse({ profile: null }).success, true);
assert.deepEqual(directProfilePatchInput.parse({ workoutSplit: { type: 'Other', custom: null }, aiEnabled: true, socialEnabled: false, baseVersion: 'v1' }), {
  workoutSplit: { type: 'Other', custom: null }, aiEnabled: true, socialEnabled: false, baseVersion: 'v1',
});
assert.equal(directProfilePatchInput.safeParse({ baseVersion: '' }).success, false);
assert.equal(profilePatchInput.safeParse({ expoPushToken: 'x'.repeat(200) }).success, true);
assert.equal(profilePatchInput.safeParse({ expoPushToken: 'x'.repeat(201) }).success, false);

for (const [schema, valid, invalid] of [
  [bodyPart, 'shoulder', 'spine'],
  [injurySeverity, 'moderate', 'critical'],
  [injuryStatus, 'resolved', 'active'],
  [injurySide, 'both', 'center'],
  [workoutStatus, 'in_progress', 'active'],
  [trackingMode, 'duration', 'weight'],
  [syncableKind, 'profile', 'user'],
  [buddyState, 'buddies', 'friends'],
] as const) {
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse(invalid).success, false);
}

assert.equal(injuryDTO.safeParse(validInjury).success, true);
assert.equal(injuryDTO.safeParse({ ...validInjury, notes: 'x'.repeat(2_001) }).success, false);
assert.equal(createInjuryInput.parse({ id: 'i1', bodyPart: 'knee', severity: 'mild', onsetDate: iso }).status, 'ongoing');
assert.equal(updateInjuryInput.safeParse({ status: 'resolved' }).success, true);
assert.equal(updateInjuryInput.safeParse({ status: 'resolved', baseVersion: '' }).success, false);
assert.equal(injuryMutationResponse.safeParse({ injury: validInjury, version: 'v2' }).success, true);
assert.equal(injuriesListResponse.safeParse({ injuries: [validInjury], version: 'v2' }).success, true);
assert.equal(injuryHistoryOpResponse.safeParse({ affectedWorkoutIds: ['w-1'] }).success, true);
assert.equal(injuryHistoryOpResponse.safeParse({ affectedWorkoutIds: [1] }).success, false);

assert.equal(performedSet.safeParse({ ...validSet, setNumber: 0 }).success, false);
assert.equal(performedSet.safeParse({ ...validSet, rpe: 11 }).success, false);
assert.equal(performedSet.safeParse({ ...validSet, reps: -1 }).success, false);
assert.equal(performedExercise.safeParse(validExercise).success, true);
for (const key of ['variationId', 'variationNameSnapshot']) {
  const missing = { ...validExercise } as Record<string, unknown>;
  delete missing[key];
  assert.equal(performedExercise.safeParse(missing).success, false, `performedExercise must require ${key}`);
}
assert.equal(workoutDTO.safeParse(validWorkoutFixture).success, true);
assert.equal(workoutDTO.safeParse({ ...validWorkoutFixture, name: 'x'.repeat(201) }).success, false);
assert.equal(workoutResponse.safeParse({ workout: validWorkoutFixture }).success, true);
assert.equal(listQuery.safeParse({ limit: 1, cursor: 'next' }).success, true);
assert.equal(listQuery.safeParse({ limit: 0 }).success, false);
assert.equal(listQuery.safeParse({ limit: 201 }).success, false);
assert.equal(listWorkoutsQuery.safeParse({ status: 'planned', limit: 200 }).success, true);
assert.equal(createWorkoutInput.safeParse({ id: 'w1', name: 'x', status: 'planned' }).success, true);
assert.equal(createWorkoutInput.safeParse({ id: '', name: 'x', status: 'planned' }).success, false);
assert.equal(createWorkoutInput.safeParse({ id: 'w1', name: 'x', status: 'active' }).success, false);
assert.equal(updateWorkoutInput.safeParse({ baseVersion: 'v1', status: 'completed' }).success, true);
assert.equal(updateWorkoutInput.safeParse({ status: 'completed' }).success, false);
assert.equal(reorderWorkoutsInput.safeParse({ order: [{ id: 'w1', queueOrder: 0 }] }).success, true);
assert.equal(reorderWorkoutsInput.safeParse({ order: new Array(201).fill({ id: 'w', queueOrder: 0 }) }).success, false);

assert.equal(exerciseVariationDTO.safeParse(validVariation).success, true);
assert.equal(exerciseVariationDTO.safeParse({ ...validVariation, aliases: 'none' }).success, false);
assert.equal(catalogExerciseDTO.safeParse(validCatalog).success, true);
assert.equal(catalogExerciseDTO.safeParse({ ...validCatalog, schemaVersion: 1 }).success, false);
assert.equal(catalogResponse.safeParse({ exercises: [validCatalog], version: 1 }).success, true);
assert.equal(catalogResponse.safeParse({ exercises: [], version: 1 }).success, false);
assert.equal(createPendingExerciseInput.safeParse({ name: '' }).success, false);
assert.equal(createPendingExerciseInput.safeParse({ name: 'x'.repeat(201) }).success, false);

assert.equal(challengeDay.safeParse(validChallengeDay).success, true);
assert.equal(challengeDay.safeParse({ ...validChallengeDay, dayNumber: 0 }).success, false);
assert.equal(pushupChallengeDTO.safeParse({ startDate: null, days: [validChallengeDay], longestStreak: 1, version: null }).success, true);
assert.equal(pushupChallengeResponse.safeParse({ challenge: { startDate: null, days: [], longestStreak: 0, version: null } }).success, true);
assert.equal(putPushupChallengeInput.safeParse({ startDate: '2026-08-12', days: [], longestStreak: 0 }).success, true);
assert.equal(putPushupChallengeInput.safeParse({ startDate: '2026-08-12', days: [{ ...validChallengeDay, completedAt: 'bad' }], longestStreak: 0 }).success, false);

assert.equal(buddySearchResult.safeParse({ uid: 'u1', username: 'Alice', state: 'none' }).success, true);
assert.equal(buddySearchResponse.safeParse({ results: [] }).success, true);
assert.equal(buddySearchResponse.safeParse({ results: [{ uid: 'u1' }] }).success, false);
assert.equal(buddyDTO.safeParse(validBuddy).success, true);
assert.equal(buddyDTO.safeParse({ ...validBuddy, currentStreak: -1 }).success, false);
assert.equal(buddyRequestDTO.safeParse(validRequest).success, true);
assert.equal(buddiesResponse.safeParse({ buddies: [validBuddy], requests: [validRequest] }).success, true);
assert.equal(buddyUid.safeParse('a'.repeat(129)).success, false);
assert.equal(sendBuddyRequestInput.safeParse({ uid: 'abc123' }).success, true);
assert.equal(sendBuddyRequestInput.safeParse({ uid: 'a-b' }).success, false);
assert.equal(localDate.safeParse('9999-99-99').success, true);
assert.equal(localDate.safeParse('0000-00-00').success, true);
assert.equal(localDate.safeParse('2026-8-1').success, false);
assert.equal(buddiesQuery.safeParse({ today: '2026-08-12' }).success, true);
assert.equal(buddyActionInput.safeParse({ action: 'accept' }).success, true);
assert.equal(buddyActionInput.safeParse({ action: 'reject' }).success, false);
assert.equal(chopInput.safeParse({ today: '2026-08-12' }).success, true);
assert.equal(chopResponse.safeParse({ chopped: true, delivered: false }).success, true);

const deleted = { workouts: 1, legacyWorkouts: 2, pushupChallenge: true, friendships: 3, userDoc: true };
assert.equal(deleteAccountDataResponse.safeParse({ deleted, partial: false }).success, true);
assert.equal(deleteAccountDataResponse.safeParse({ deleted: { ...deleted, workouts: 1.5 }, partial: false }).success, false);
assert.equal(manifestEntry.safeParse({ kind: 'workout', id: 'w1', version: 'v1' }).success, true);
assert.equal(manifestQuery.safeParse({ limit: 200 }).success, true);
assert.equal(manifestResponse.safeParse({ items: [{ kind: 'profile', id: 'u1', version: 'v1' }], nextCursor: null }).success, true);
assert.equal(pullResponse.safeParse({ workouts: [], injuries: [], missing: [{ kind: 'workout', id: 'w1' }] }).success, true);

// The profile allowlist is duplicated at three boundaries. Keep the test
// source-relative so it runs from either the workspace root or this package.
const rulesText = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
const remoteText = readFileSync(new URL('../../../apps/mobile/src/data/firestore-sync-remote.ts', import.meta.url), 'utf8');
const ownerFields = ['aiEnabled', 'socialEnabled', 'workoutSplit'];
assert.deepEqual(Object.keys(directProfilePatchInput.shape).filter((key) => key !== 'baseVersion').sort(), ownerFields);
const rulesAllowlist = rulesText.match(/affectedKeys\(\)\.hasOnly\(\[([^\]]+)\]\)/)?.[1]
  ?.match(/'([^']+)'/g)?.map((key) => key.slice(1, -1)).sort();
assert.deepEqual(rulesAllowlist, ownerFields);
for (const field of ownerFields) assert.match(remoteText, new RegExp(`\\b${field}\\b`));
assert.match(remoteText, /const updateMask = Object\.keys\(fields\)/);
