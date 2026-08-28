import assert from 'node:assert/strict';
import {
  decodeFirestoreDocument,
  decodeFirestoreValue,
  decodeFirestoreFields,
  encodeFirestoreValue,
  encodeFirestoreFields,
  firestoreDocumentReference,
  firestorePaths,
  firestoreTimestamp,
} from './firestore-rest.js';
import { catalogExerciseDTO, injuryDTO, profileDTO, pushupChallengeDTO, workoutDTO, type CatalogExerciseDTO } from './api-contract.js';

const timestamp = '2026-08-12T12:00:00.000Z';
const fields = encodeFirestoreFields({
  title: 'Push Day',
  integer: 8,
  decimal: 135.5,
  enabled: true,
  nullable: null,
  tags: ['chest', 'push'],
  nested: { setNumber: 1 },
  createdAt: firestoreTimestamp(timestamp),
});

assert.deepEqual(encodeFirestoreFields({ cursor: firestoreDocumentReference('projects/demo/databases/(default)/documents/workouts/w1') }), {
  cursor: { referenceValue: 'projects/demo/databases/(default)/documents/workouts/w1' },
});

assert.deepEqual(decodeFirestoreFields(fields), {
  title: 'Push Day',
  integer: 8,
  decimal: 135.5,
  enabled: true,
  nullable: null,
  tags: ['chest', 'push'],
  nested: { setNumber: 1 },
  createdAt: timestamp,
});

const document = decodeFirestoreDocument({
  name: 'projects/demo/databases/(default)/documents/workouts/w1',
  fields,
  updateTime: timestamp,
});
assert.equal(document.path, 'workouts/w1');
assert.equal(document.version, timestamp);
assert.throws(() => decodeFirestoreDocument({ name: 'workouts/w1', updateTime: '', fields: {} }));
assert.throws(() => decodeFirestoreFields({ bad: { integerValue: 'not-a-number' } }));

// The REST codec deliberately maps both absent and explicit null values to
// Firestore nullValue. BUG: a bare Date is currently treated as an ordinary
// object/map instead of throwing; callers must opt into the timestamp wire
// type with ts()/firestoreTimestamp(), and the focused follow-up bead tracks
// correcting this codec footgun.
assert.deepEqual(encodeFirestoreValue(null), { nullValue: null });
assert.deepEqual(encodeFirestoreValue(undefined), { nullValue: null });
assert.deepEqual(encodeFirestoreValue(new Date(timestamp)), { mapValue: { fields: {} } });
assert.throws(() => encodeFirestoreValue(Number.NaN), /finite/);
assert.throws(() => encodeFirestoreValue(Number.POSITIVE_INFINITY), /finite/);
assert.deepEqual(encodeFirestoreValue(-0), { integerValue: '0' });
assert.throws(() => decodeFirestoreValue({ integerValue: String(Number.MAX_SAFE_INTEGER + 1) }), /Malformed Firestore integer/);

// Timestamp decoding intentionally returns an ISO string. Re-encoding that
// ordinary string therefore changes its Firestore wire kind; this is a codec
// boundary, not an involution over every tagged value.
const timestampWire = encodeFirestoreValue(firestoreTimestamp(timestamp));
assert.deepEqual(timestampWire, { timestampValue: timestamp });
assert.equal(decodeFirestoreValue(timestampWire), timestamp);
assert.deepEqual(encodeFirestoreValue(decodeFirestoreValue(timestampWire)), { stringValue: timestamp });

const workout = {
  id: 'w1', name: 'Push Day', status: 'completed' as const, performedExercises: [], createdAt: timestamp, updatedAt: timestamp, version: timestamp,
};
const profile = { workoutSplit: null, username: null, aiUsage: null, aiEnabled: null, socialEnabled: null, version: timestamp };
const injury = { id: 'inj1', bodyPart: 'shoulder' as const, severity: 'mild' as const, status: 'ongoing' as const, onsetDate: timestamp, createdAt: timestamp, updatedAt: timestamp };
const challenge = { startDate: '2026-08-12', days: [], longestStreak: 0, version: timestamp };
const catalog: CatalogExerciseDTO = {
  id: 'bench-press', name: 'Bench Press', normalizedName: 'bench press', aliases: [], primaryMuscles: ['chest'], secondaryMuscles: [],
  movementPattern: '', equipment: [], bodyRegion: 'upper', mechanics: 'compound', forceType: 'push', trackingModes: ['reps_weight'], variations: [], schemaVersion: 2,
};

function roundTrip<T>(schema: { parse(value: unknown): T }, value: T): T {
  return schema.parse(decodeFirestoreFields(encodeFirestoreFields(value as Record<string, unknown>)));
}

assert.deepEqual(roundTrip(workoutDTO, workout), workout);
assert.deepEqual(roundTrip(profileDTO, profile), {
  workoutSplit: null, username: null, aiUsage: null, aiEnabled: null, socialEnabled: null, version: timestamp,
});
assert.equal(profileDTO.safeParse({ workoutSplit: null, username: null, aiUsage: null, aiEnabled: null, socialEnabled: null, version: '' }).success, false);
assert.deepEqual(roundTrip(injuryDTO, injury), injury);
assert.deepEqual(roundTrip(pushupChallengeDTO, challenge), challenge);
assert.deepEqual(roundTrip(catalogExerciseDTO, catalog), catalog);

assert.equal(firestorePaths.user('uid-1'), 'users/uid-1');
assert.equal(firestorePaths.injury('uid-1', 'inj-1'), 'users/uid-1/injuries/inj-1');
assert.equal(firestorePaths.pushupChallenge('uid-1'), 'users/uid-1/pushup-challenge/data');
assert.throws(() => firestorePaths.workout('bad/id'));

console.log('firestore-rest: all assertions passed');
