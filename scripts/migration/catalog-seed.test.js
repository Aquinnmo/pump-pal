const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog } = require('./seed-exercise-catalog');
const { MUSCLE_IDS } = require('./canonical-muscles');

const catalogPath = path.join(__dirname, '..', '..', 'migration', 'catalog-seed.json');
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

console.log(`catalog-seed.test.js passed: ${catalog.exercises.length} exercises validated`);
