const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {
  seedExerciseCatalog,
  validateCatalog,
  buildExerciseDocument,
} = require('./seed-exercise-catalog');
const { MUSCLE_IDS } = require('./canonical-muscles');

const catalogPath = path.join(__dirname, 'catalog-seed.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const canonicalMuscle = MUSCLE_IDS[0];

function validVariation(overrides = {}) {
  return {
    id: 'variation-1',
    name: 'Variation',
    primaryMuscles: [canonicalMuscle],
    secondaryMuscles: [],
    ...overrides,
  };
}

function validExercise(overrides = {}) {
  return {
    id: 'exercise-1',
    name: 'Exercise',
    primaryMuscles: [canonicalMuscle],
    secondaryMuscles: [],
    variations: [validVariation()],
    ...overrides,
  };
}

const errors = validateCatalog(catalog);
assert.deepEqual(errors, []);

assert.deepEqual(validateCatalog({ schemaVersion: 1, exercises: [] }), [
  'catalog.schemaVersion must be 2',
  'catalog.exercises must be a non-empty array',
]);
assert.deepEqual(validateCatalog({ schemaVersion: 2, exercises: [] }), [
  'catalog.exercises must be a non-empty array',
]);
assert.ok(
  validateCatalog({ schemaVersion: 2, exercises: [validExercise(), validExercise({ id: 'exercise-1' })] }).includes(
    'duplicate exercise id: exercise-1'
  )
);
assert.ok(
  validateCatalog({ schemaVersion: 2, exercises: [validExercise({ primaryMuscles: [] })] }).includes(
    'exercises[0].primaryMuscles must be a non-empty array'
  )
);
assert.ok(
  validateCatalog({
    schemaVersion: 2,
    exercises: [validExercise({ primaryMuscles: ['not-a-canonical-muscle'] })],
  }).includes('exercises[0].primaryMuscles has unknown muscle id: not-a-canonical-muscle')
);
assert.ok(
  validateCatalog({
    schemaVersion: 2,
    exercises: [
      validExercise({
        variations: [validVariation(), validVariation({ name: 'Duplicate variation' })],
      }),
    ],
  }).includes('duplicate variation id: exercise-1/variation-1')
);

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
assert.equal(
  buildExerciseDocument({ id: 'x' }, now).status,
  'approved',
  'an omitted status defaults to approved'
);

async function assertDryRunDoesNotReadCredentialsOrOpenSockets() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-seed-test-'));
  const dryRunCatalogPath = path.join(tempDirectory, 'catalog.json');
  const credentialPath = path.join(tempDirectory, 'credential-must-not-be-read.json');
  fs.writeFileSync(
    dryRunCatalogPath,
    JSON.stringify({ schemaVersion: 2, exercises: [validExercise()] })
  );

  const originalReadFileSync = fs.readFileSync;
  const originalHttpsRequest = https.request;
  const originalNetConnect = net.connect;
  const originalNetCreateConnection = net.createConnection;
  fs.readFileSync = (filePath, ...args) => {
    if (path.resolve(filePath) === credentialPath) {
      throw new Error('credential file was read during dry run');
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  };
  https.request = () => {
    throw new Error('socket opened during dry run');
  };
  net.connect = () => {
    throw new Error('socket opened during dry run');
  };
  net.createConnection = () => {
    throw new Error('socket opened during dry run');
  };

  try {
    const result = await seedExerciseCatalog({
      catalogPath: dryRunCatalogPath,
      credentialPath,
      apply: false,
      version: 7,
    });
    assert.deepEqual(result, {
      applied: false,
      projectId: null,
      plannedWriteCount: 2,
      exerciseCount: 1,
      documentPaths: ['exercises/exercise-1', 'exerciseCatalogMeta/current'],
    });
  } finally {
    fs.readFileSync = originalReadFileSync;
    https.request = originalHttpsRequest;
    net.connect = originalNetConnect;
    net.createConnection = originalNetCreateConnection;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

assertDryRunDoesNotReadCredentialsOrOpenSockets()
  .then(() => {
    console.log(`catalog-seed.test.js passed: ${catalog.exercises.length} exercises validated`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
