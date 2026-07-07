const fs = require('node:fs');
const path = require('node:path');
const { getAccessToken, requestJson } = require('./firestore-readonly-snapshot');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const args = {
    apply: false,
    catalogPath: path.join('migration', 'catalog-seed.json'),
    credentialPath: 'pumppal-read-only-perms.json',
    version: 1,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--catalog') {
      args.catalogPath = argv[index + 1];
      index += 1;
    } else if (arg === '--credential') {
      args.credentialPath = argv[index + 1];
      index += 1;
    } else if (arg === '--catalog-version' || arg === '--version') {
      args.version = Number(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.version) || args.version < 1) {
    throw new Error('--catalog-version must be a positive integer');
  }

  return args;
}

function validateCatalog(catalog) {
  const errors = [];
  const ids = new Set();

  if (catalog.schemaVersion !== 2) {
    errors.push('catalog.schemaVersion must be 2');
  }

  if (!Array.isArray(catalog.exercises) || catalog.exercises.length === 0) {
    errors.push('catalog.exercises must be a non-empty array');
    return errors;
  }

  catalog.exercises.forEach((exercise, index) => {
    const prefix = `exercises[${index}]`;
    if (!exercise.id) errors.push(`${prefix}.id is required`);
    if (!exercise.name) errors.push(`${prefix}.name is required`);
    if (ids.has(exercise.id)) errors.push(`duplicate exercise id: ${exercise.id}`);
    ids.add(exercise.id);

    if (!Array.isArray(exercise.variations)) {
      errors.push(`${prefix}.variations must be an array`);
      return;
    }

    const variationIds = new Set();
    exercise.variations.forEach((variation, variationIndex) => {
      const variationPrefix = `${prefix}.variations[${variationIndex}]`;
      if (!variation.id) errors.push(`${variationPrefix}.id is required`);
      if (!variation.name) errors.push(`${variationPrefix}.name is required`);
      if (variationIds.has(variation.id)) errors.push(`duplicate variation id: ${exercise.id}/${variation.id}`);
      variationIds.add(variation.id);
    });
  });

  return errors;
}

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  if (isFirestoreTimestamp(value)) return { timestampValue: value.__firestoreTimestampIso };
  if (typeof value === 'object') return { mapValue: { fields: jsObjectToFirestoreFields(value) } };
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function firestoreTimestamp(isoString) {
  return { __firestoreTimestampIso: isoString };
}

function isFirestoreTimestamp(value) {
  return (
    value &&
    typeof value === 'object' &&
    Object.keys(value).length === 1 &&
    typeof value.__firestoreTimestampIso === 'string'
  );
}

function timestampShapeToIso(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(Number(value.seconds))) return null;

  const seconds = Number(value.seconds);
  const nanoseconds = Number(value.nanoseconds) || 0;
  const milliseconds = seconds * 1000 + Math.floor(nanoseconds / 1000000);
  return new Date(milliseconds).toISOString();
}

function jsObjectToFirestoreFields(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, jsToFirestoreValue(value)]));
}

function documentUrl(projectId, documentPath) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function patchDocument({ accessToken, projectId, documentPath, data }) {
  const body = JSON.stringify({ fields: jsObjectToFirestoreFields(data) });
  return requestJson(
    documentUrl(projectId, documentPath),
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );
}

function buildExerciseDocument(exercise, now) {
  return {
    ...exercise,
    schemaVersion: 2,
    updatedAt: now,
  };
}

async function seedExerciseCatalog({ catalogPath, credentialPath, apply, version }) {
  const catalog = readJson(catalogPath);
  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(`Catalog validation failed:\n${errors.join('\n')}`);
  }

  const now = new Date().toISOString();
  const plannedWrites = [
    ...catalog.exercises.map((exercise) => ({
      documentPath: `exercises/${exercise.id}`,
      data: buildExerciseDocument(exercise, now),
    })),
    {
      documentPath: 'exerciseCatalogMeta/current',
      data: {
        version,
        exerciseCount: catalog.exercises.length,
        schemaVersion: catalog.schemaVersion,
        updatedAt: now,
      },
    },
  ];

  if (!apply) {
    return {
      applied: false,
      projectId: null,
      plannedWriteCount: plannedWrites.length,
      exerciseCount: catalog.exercises.length,
      documentPaths: plannedWrites.map((write) => write.documentPath),
    };
  }

  const serviceAccount = readJson(credentialPath);
  const accessToken = await getAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;

  for (const write of plannedWrites) {
    await patchDocument({ accessToken, projectId, documentPath: write.documentPath, data: write.data });
  }

  return {
    applied: true,
    projectId,
    plannedWriteCount: plannedWrites.length,
    exerciseCount: catalog.exercises.length,
    documentPaths: plannedWrites.map((write) => write.documentPath),
  };
}

async function run(argv) {
  const args = parseArgs(argv);
  const result = await seedExerciseCatalog(args);

  console.log(result.applied ? `Seeded project ${result.projectId}` : 'Dry run only; no Firestore writes');
  console.log(`Exercise docs: ${result.exerciseCount}`);
  console.log(`Total docs: ${result.plannedWriteCount}`);
  console.log('First docs:');
  result.documentPaths.slice(0, 10).forEach((documentPath) => console.log(`- ${documentPath}`));

  if (!result.applied) {
    console.log('Run with --apply and a write-capable service account to write Firestore.');
  }
}

if (require.main === module) {
  run(process.argv).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  seedExerciseCatalog,
  validateCatalog,
  firestoreTimestamp,
  jsToFirestoreValue,
  jsObjectToFirestoreFields,
  patchDocument,
  timestampShapeToIso,
};
