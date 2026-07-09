// Guards against canonical-muscles.js (CommonJS, used by migration scripts)
// drifting from constants/muscles.ts (the app's source of truth).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MUSCLE_IDS } = require('./canonical-muscles');

const tsSourcePath = path.join(__dirname, '..', '..', 'constants', 'muscles.ts');
const tsSource = fs.readFileSync(tsSourcePath, 'utf8');

const match = tsSource.match(/export const MUSCLES = \[([\s\S]*?)\] as const;/);
assert.ok(match, 'could not find MUSCLES array in constants/muscles.ts');

const tsMuscleIds = match[1]
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.replace(/^'|'$/g, ''));

assert.deepEqual(
  MUSCLE_IDS,
  tsMuscleIds,
  'scripts/migration/canonical-muscles.js is out of sync with constants/muscles.ts'
);

console.log('canonical-muscles.test.js passed: muscle id lists match');
