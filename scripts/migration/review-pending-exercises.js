const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');

const { fieldsToJs, getAccessToken, listDocuments, requestJson } = require('./firestore-readonly-snapshot');
const { seedExerciseCatalog, validateCatalog } = require('./seed-exercise-catalog');
const { MUSCLE_IDS } = require('./canonical-muscles');

const DEFAULT_CREDENTIAL_PATH = 'pumppal-read-only-perms.json';
const DEFAULT_CATALOG_PATH = path.join('migration', 'catalog-seed.json');
const VALID_BODY_REGIONS = ['upper', 'lower', 'core', 'full_body'];
const VALID_MECHANICS = ['compound', 'isolation', 'static', 'cardio'];
const VALID_FORCE_TYPES = ['push', 'pull', 'hinge', 'squat', 'carry', 'rotation', 'static', 'mixed'];
const VALID_TRACKING_MODES = ['reps_weight', 'reps_bodyweight', 'duration', 'distance'];
const MUSCLE_ID_SET = new Set(MUSCLE_IDS);

function parseArgs(argv) {
  const args = {
    apply: false,
    catalogPath: DEFAULT_CATALOG_PATH,
    credentialPath: DEFAULT_CREDENTIAL_PATH,
    dryRun: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--catalog') {
      args.catalogPath = argv[index + 1];
      index += 1;
    } else if (arg === '--credential') {
      args.credentialPath = argv[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.apply && args.dryRun) throw new Error('--apply and --dry-run cannot be used together');
  return args;
}

function printHelp() {
  console.log(`Usage: npm run migration:review:exercises -- [options]

Options:
  --apply                 Apply approved/rejected changes after confirmation.
  --dry-run               Read and preview pending exercises without writes.
  --credential <path>     Service-account JSON path.
  --catalog <path>        Catalog seed JSON path.
  -h, --help              Show this help.

Without --apply, the command is read-only even after confirmation.`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function documentId(documentName) {
  return documentName.split('/').pop();
}

function documentUrl(projectId, documentPath) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function getDocument({ accessToken, projectId, documentPath }) {
  return requestJson(documentUrl(projectId, documentPath), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function deleteDocument({ accessToken, projectId, documentPath }) {
  return requestJson(documentUrl(projectId, documentPath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function timestampMillis(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  if (typeof value === 'string') return Date.parse(value);
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
  return Number.POSITIVE_INFINITY;
}

function pendingExercisesFromDocuments(documents) {
  return documents
    .map((document) => ({ id: documentId(document.name), ...fieldsToJs(document.fields || {}) }))
    .filter((exercise) => exercise.status === 'pending_review')
    .sort((left, right) => {
      const dateDifference = timestampMillis(left.createdAt) - timestampMillis(right.createdAt);
      return dateDifference || left.id.localeCompare(right.id);
    });
}

function unique(values) {
  return [...new Set(values)];
}

function parseCommaList(value) {
  return unique(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function muscleErrors(values, field) {
  const errors = [];
  if (field === 'primaryMuscles' && values.length === 0) errors.push(`${field} must not be empty`);
  values.forEach((muscle) => {
    if (!MUSCLE_ID_SET.has(muscle)) errors.push(`${field} has unknown muscle id: ${muscle}`);
  });
  return errors;
}

function buildVariation({ id, name, aliases, primaryMuscles, secondaryMuscles, equipment, angle, grip, stance, side, loadType, mechanics }) {
  const variation = { id, name, aliases, primaryMuscles, secondaryMuscles };
  for (const [key, value] of Object.entries({ equipment, angle, grip, stance, side, loadType, mechanics })) {
    if (value) variation[key] = value;
  }
  return variation;
}

function buildApprovedExercise({ pending, name, aliases, primaryMuscles, secondaryMuscles, movementPattern, equipment, bodyRegion, mechanics, forceType, trackingModes, variations }) {
  return {
    id: pending.id,
    name,
    normalizedName: name.toLowerCase(),
    aliases,
    primaryMuscles,
    secondaryMuscles,
    movementPattern,
    equipment,
    bodyRegion,
    mechanics,
    forceType,
    trackingModes,
    variations,
    schemaVersion: 2,
    status: 'approved',
  };
}

function addExerciseToCatalog(catalog, exercise) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.exercises)) {
    throw new Error('Catalog must contain schemaVersion 2 and an exercises array');
  }
  if (catalog.exercises.some((item) => item.id === exercise.id)) throw new Error(`Catalog already contains exercise id ${exercise.id}`);
  return { ...catalog, exercises: [...catalog.exercises, exercise] };
}

function nextCatalogVersion(meta) {
  const current = Number(meta?.fields?.version?.integerValue ?? meta?.version ?? 0);
  return Number.isInteger(current) && current >= 0 ? current + 1 : 1;
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

async function seedCandidate({ catalog, catalogPath, credentialPath, version }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pump-pal-review-'));
  const temporaryCatalogPath = path.join(temporaryDirectory, 'catalog-seed.json');
  fs.writeFileSync(temporaryCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  try {
    await seedExerciseCatalog({ catalogPath: temporaryCatalogPath, credentialPath, apply: true, version });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  writeJsonAtomic(catalogPath, catalog);
}

function createPrompt() {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    input,
    async ask(question, defaultValue = '') {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      const answer = (await input.question(`${question}${suffix}: `)).trim();
      return answer || defaultValue;
    },
    async confirm(question) {
      const answer = (await input.question(`${question} (y/N): `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
  };
}

async function askChoice(prompt, question, choices, defaultValue) {
  while (true) {
    console.log(`${question}:`);
    choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
    const defaultChoice = defaultValue ? String(choices.indexOf(defaultValue) + 1) : '';
    const answer = await prompt.ask('Choose', defaultChoice);
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && choices[index]) return choices[index];
    console.log('Please choose one of the listed numbers.');
  }
}

async function askMuscles(prompt, field, required) {
  while (true) {
    const values = parseCommaList(await prompt.ask(`${field} comma-separated${required ? '' : ' (optional)'}`));
    const errors = muscleErrors(values, required ? 'primaryMuscles' : 'secondaryMuscles');
    if (errors.length === 0) return values;
    console.log(errors.join('\n'));
  }
}

async function askTrackingModes(prompt) {
  while (true) {
    const values = parseCommaList(await prompt.ask(`Tracking modes (${VALID_TRACKING_MODES.join(', ')})`, 'reps_weight'));
    const invalid = values.filter((value) => !VALID_TRACKING_MODES.includes(value));
    if (values.length > 0 && invalid.length === 0) return values;
    console.log(`Tracking modes must be selected from: ${VALID_TRACKING_MODES.join(', ')}`);
  }
}

async function askVariation(prompt, index) {
  const name = await prompt.ask(`Variation ${index + 1} name`);
  if (!name) throw new Error('Variation name is required');
  const variation = {
    id: await prompt.ask('Variation id', slugify(name)),
    name,
    aliases: parseCommaList(await prompt.ask('Variation aliases (optional)')),
    primaryMuscles: await askMuscles(prompt, 'Variation primary muscles', true),
    secondaryMuscles: await askMuscles(prompt, 'Variation secondary muscles', false),
    equipment: await prompt.ask('Variation equipment (optional)'),
    angle: await prompt.ask('Variation angle (optional)'),
    grip: await prompt.ask('Variation grip (optional)'),
    stance: await prompt.ask('Variation stance (optional)'),
    side: await prompt.ask('Variation side (optional)'),
    loadType: await prompt.ask('Variation load type (optional)'),
    mechanics: await prompt.ask('Variation mechanics (optional)'),
  };
  return buildVariation(variation);
}

async function promptApprovedExercise(prompt, pending) {
  const name = await prompt.ask('Curated name', pending.name);
  if (!name) throw new Error('Curated name is required');
  const aliases = parseCommaList(await prompt.ask('Aliases (optional)', (pending.aliases || []).join(', ')));
  const primaryMuscles = await askMuscles(prompt, 'Primary muscles', true);
  const secondaryMuscles = await askMuscles(prompt, 'Secondary muscles', false);
  const movementPattern = await prompt.ask('Movement pattern (optional)', pending.movementPattern || '');
  const equipment = parseCommaList(await prompt.ask('Parent equipment (optional)', (pending.equipment || []).join(', ')));
  const bodyRegion = await askChoice(prompt, 'Body region', VALID_BODY_REGIONS, pending.bodyRegion || 'full_body');
  const mechanics = await askChoice(prompt, 'Mechanics', VALID_MECHANICS, pending.mechanics || 'compound');
  const forceType = await askChoice(prompt, 'Force type', VALID_FORCE_TYPES, pending.forceType || 'mixed');
  const trackingModes = await askTrackingModes(prompt);
  const variationCount = Number(await prompt.ask('Number of variations', String((pending.variations || []).length || 0)));
  if (!Number.isInteger(variationCount) || variationCount < 0) throw new Error('Number of variations must be a non-negative integer');
  const variations = [];
  for (let index = 0; index < variationCount; index += 1) variations.push(await askVariation(prompt, index));

  return buildApprovedExercise({ pending, name, aliases, primaryMuscles, secondaryMuscles, movementPattern, equipment, bodyRegion, mechanics, forceType, trackingModes, variations });
}

function printPendingExercises(pending) {
  console.log('\nPending exercises:');
  pending.forEach((exercise, index) => {
    const created = exercise.createdAt ? new Date(timestampMillis(exercise.createdAt)).toISOString() : 'unknown date';
    console.log(`${index + 1}. ${exercise.name} (${exercise.id}) — creator: ${exercise.createdBy || 'unknown'} — created: ${created}`);
  });
}

async function selectPending(prompt, pending) {
  while (true) {
    printPendingExercises(pending);
    const answer = await prompt.ask('Select a number, or q to quit');
    if (answer.toLowerCase() === 'q') return null;
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && pending[index]) return pending[index];
    console.log('Please select a listed number or q.');
  }
}

async function run(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const serviceAccount = readJson(args.credentialPath);
  const projectId = serviceAccount.project_id;
  const accessToken = await getAccessToken(serviceAccount);
  const pendingDocuments = await listDocuments({ accessToken, projectId, collectionPath: 'exercises' });
  const pending = pendingExercisesFromDocuments(pendingDocuments);
  if (pending.length === 0) {
    console.log('No pending exercises found.');
    return;
  }

  const catalog = readJson(args.catalogPath);
  const prompt = createPrompt();
  const canApply = args.apply && !args.dryRun;

  try {
    while (pending.length > 0) {
      const selected = await selectPending(prompt, pending);
      if (!selected) return;
      const action = await askChoice(prompt, `Action for ${selected.name}`, ['approve', 'reject', 'skip'], 'skip');
      if (action === 'skip') continue;

      if (action === 'reject') {
        if (!(await prompt.confirm(`Delete ${selected.id} permanently`))) continue;
        if (canApply) {
          await deleteDocument({ accessToken, projectId, documentPath: `exercises/${selected.id}` });
          console.log(`Deleted ${selected.id}.`);
        } else {
          console.log(`[dry run] Would delete exercises/${selected.id}.`);
        }
        pending.splice(pending.indexOf(selected), 1);
        continue;
      }

      let approvedExercise;
      try {
        approvedExercise = await promptApprovedExercise(prompt, selected);
      } catch (error) {
        console.log(`Could not build approval: ${error.message}`);
        continue;
      }

      let candidateCatalog;
      try {
        candidateCatalog = addExerciseToCatalog(catalog, approvedExercise);
        const errors = validateCatalog(candidateCatalog);
        if (errors.length > 0) throw new Error(errors.join('\n'));
      } catch (error) {
        console.log(`Catalog validation failed:\n${error.message}`);
        continue;
      }

      console.log('\nProposed catalog entry:');
      console.log(JSON.stringify(approvedExercise, null, 2));
      if (!(await prompt.confirm(canApply ? 'Apply this approval' : 'Preview this approval'))) continue;

      if (canApply) {
        let metadata = null;
        try {
          metadata = await getDocument({ accessToken, projectId, documentPath: 'exerciseCatalogMeta/current' });
        } catch (error) {
          if (!String(error.message).includes('HTTP 404')) throw error;
        }
        const version = nextCatalogVersion(metadata);
        console.log(`Seeding Firestore with catalog version ${version}...`);
        await seedCandidate({ catalog: { ...candidateCatalog }, catalogPath: args.catalogPath, credentialPath: args.credentialPath, version });
        Object.assign(catalog, candidateCatalog);
        console.log(`Approved ${selected.id} and updated ${args.catalogPath}.`);
      } else {
        console.log(`[dry run] Would add ${selected.id} and seed Firestore with the next catalog version.`);
      }
      pending.splice(pending.indexOf(selected), 1);
    }
  } finally {
    prompt.input.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  addExerciseToCatalog,
  buildApprovedExercise,
  buildVariation,
  deleteDocument,
  documentUrl,
  filterPendingExercises: pendingExercisesFromDocuments,
  nextCatalogVersion,
  parseArgs,
  parseCommaList,
  seedCandidate,
  timestampMillis,
};
