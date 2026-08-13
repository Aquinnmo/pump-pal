const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog, buildExerciseDocument } = require('./seed-exercise-catalog');
const { MUSCLE_IDS } = require('./canonical-muscles');

const catalogPath = path.join(__dirname, 'catalog-seed.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const errors = validateCatalog(catalog);
assert.deepEqual(errors, []);

const muscleIdSet = new Set(MUSCLE_IDS);

catalog.exercises.forEach((exercise) => {
  assert.ok(exercise.primaryMuscles.length > 0, `${exercise.id}.primaryMuscles must not be empty`);
  assert.ok(exercise.secondaryMuscles.length >= 0, `${exercise.id}.secondaryMuscles must be an array`);
  exercise.variations.forEach((variation) => {
    assert.ok(
      Array.isArray(variation.primaryMuscles) && variation.primaryMuscles.length > 0,
      `${exercise.id}/${variation.id}.primaryMuscles must not be empty`
    );
    assert.ok(
      Array.isArray(variation.secondaryMuscles),
      `${exercise.id}/${variation.id}.secondaryMuscles must be an array (may be empty)`
    );
    [...variation.primaryMuscles, ...variation.secondaryMuscles].forEach((muscle) => {
      assert.ok(muscleIdSet.has(muscle), `${exercise.id}/${variation.id} has unknown muscle id: ${muscle}`);
    });
  });
});

// firestore.rules gates catalog reads on `status == 'approved'`, and an equality
// filter never matches a document missing the field — a seeded exercise without
// one is invisible to every client (this is how 74 of 78 went dark).
const now = new Date().toISOString();
catalog.exercises.forEach((exercise) => {
  const document = buildExerciseDocument(exercise, now);
  assert.ok(document.status, `${exercise.id} must be written with a status`);
  assert.notEqual(
    document.status,
    'pending_review',
    `${exercise.id} is seeded as an approved catalog entry, not a submission`
  );
});
assert.equal(
  buildExerciseDocument({ id: 'x', status: 'pending_review' }, now).status,
  'pending_review',
  'an explicit status must survive the default'
);

console.log(`catalog-seed.test.js passed: ${catalog.exercises.length} exercises validated`);
