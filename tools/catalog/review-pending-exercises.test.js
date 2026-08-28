const assert = require('node:assert/strict');
const path = require('node:path');
const {
  addExerciseToCatalog,
  buildApprovedExercise,
  buildVariation,
  documentUrl,
  filterPendingExercises,
  nextCatalogVersion,
  parseArgs,
  parseCommaList,
  timestampMillis,
} = require('./review-pending-exercises');
const { validateCatalog } = require('./seed-exercise-catalog');

function firestoreString(value) {
  return { stringValue: value };
}

function firestoreTimestamp(value) {
  return { timestampValue: value };
}

const documents = [
  {
    name: 'projects/test/databases/(default)/documents/exercises/pending-newer',
    fields: {
      name: firestoreString('Newer'),
      status: firestoreString('pending_review'),
      createdAt: firestoreTimestamp('2026-08-02T12:00:00.000Z'),
    },
  },
  {
    name: 'projects/test/databases/(default)/documents/exercises/approved',
    fields: { status: firestoreString('approved') },
  },
  {
    name: 'projects/test/databases/(default)/documents/exercises/pending-older',
    fields: {
      name: firestoreString('Older'),
      status: firestoreString('pending_review'),
      createdAt: firestoreTimestamp('2026-08-01T12:00:00.000Z'),
    },
  },
];

const pending = filterPendingExercises(documents);
assert.deepEqual(pending.map((exercise) => exercise.id), ['pending-older', 'pending-newer']);
assert.equal(timestampMillis(pending[0].createdAt), Date.parse('2026-08-01T12:00:00.000Z'));

assert.deepEqual(parseCommaList(' chest, triceps, chest '), ['chest', 'triceps']);
assert.deepEqual(parseCommaList(''), []);

const variation = buildVariation({
  id: 'cable',
  name: 'Cable Lateral Raise',
  aliases: [],
  primaryMuscles: ['side delts'],
  secondaryMuscles: [],
  equipment: 'cable',
});
const approvedExercise = buildApprovedExercise({
  pending: { id: 'pending-lateral-raise' },
  name: 'Lateral Raise',
  aliases: [],
  primaryMuscles: ['side delts'],
  secondaryMuscles: [],
  movementPattern: '',
  equipment: ['cable'],
  bodyRegion: 'upper',
  mechanics: 'isolation',
  forceType: 'push',
  trackingModes: ['reps_weight'],
  variations: [variation],
});

assert.equal(approvedExercise.id, 'pending-lateral-raise');
assert.equal(approvedExercise.status, 'approved');
assert.equal(approvedExercise.variations[0].id, 'cable');

assert.deepEqual(validateCatalog({ schemaVersion: 2, exercises: [approvedExercise] }), []);
assert.match(
  validateCatalog({
    schemaVersion: 2,
    exercises: [{ ...approvedExercise, primaryMuscles: [] }],
  }).join('\n'),
  /primaryMuscles must be a non-empty array/
);
assert.match(
  validateCatalog({
    schemaVersion: 2,
    exercises: [{
      ...approvedExercise,
      variations: [variation, { ...variation, name: 'Duplicate variation' }],
    }],
  }).join('\n'),
  /duplicate variation id/
);

const catalog = { schemaVersion: 2, exercises: [] };
const candidate = addExerciseToCatalog(catalog, approvedExercise);
assert.equal(candidate.exercises.length, 1);
assert.equal(catalog.exercises.length, 0, 'add should not mutate the original catalog');
assert.throws(() => addExerciseToCatalog(candidate, approvedExercise), /already contains/);

assert.equal(nextCatalogVersion(null), 1);
assert.equal(nextCatalogVersion({ fields: { version: { integerValue: '7' } } }), 8);
// BUG: doubleValue metadata is ignored, so a stored version can move backward to 1.
assert.equal(nextCatalogVersion({ fields: { version: { doubleValue: 7 } } }), 1);
assert.equal(
  documentUrl('pumppal-c9199', 'exercises/pending-row'),
  'https://firestore.googleapis.com/v1/projects/pumppal-c9199/databases/(default)/documents/exercises/pending-row'
);
assert.deepEqual(parseArgs(['node', 'script', '--dry-run', '--catalog', 'custom.json']), {
  apply: false,
  catalogPath: 'custom.json',
  credentialPath: 'pumppal-read-only-perms.json',
  dryRun: true,
  help: false,
});
assert.throws(() => parseArgs(['node', 'script', '--apply', '--dry-run']), /cannot be used together/);
assert.deepEqual(parseArgs(['node', 'script']), {
  apply: false,
  catalogPath: path.join(__dirname, 'catalog-seed.json'),
  credentialPath: 'pumppal-read-only-perms.json',
  dryRun: false,
  help: false,
});

console.log('review-pending-exercises.test.js passed');
