#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CHECKER = path.join(__dirname, 'check-boundary-isolation.js');

function runChecker() {
  return spawnSync(process.execPath, [CHECKER], { cwd: ROOT, encoding: 'utf8' });
}

function withFixtures(fixtures, callback) {
  const paths = fixtures.map(({ relativePath, source }) => {
    const absolutePath = path.join(ROOT, relativePath);
    fs.writeFileSync(absolutePath, source);
    return absolutePath;
  });
  try {
    return callback();
  } finally {
    for (const absolutePath of paths) fs.unlinkSync(absolutePath);
  }
}

const baseline = runChecker();
assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);

// Assemble the fixture spellings so this test file's own source is not
// mistaken for a violation while the checker scans tools/.
const requireForm = ['req', "uire('firebase');"].join('');
const bareImportForm = ['imp', "ort 'firebase-admin';"].join('');
const dynamicImportForm = ['imp', "ort('firebase/app');"].join('');

for (const [name, source] of [
  ['require', `const firebase = ${requireForm}`],
  ['bare-import', bareImportForm],
  ['dynamic-import', `void ${dynamicImportForm}`],
]) {
  const result = withFixtures([
    { relativePath: `apps/api/src/boundary-isolation-${name}.ts`, source },
  ], runChecker);
  assert.notEqual(result.status, 0, `${name} fixture was not rejected`);
  assert.match(result.stderr, new RegExp(`boundary-isolation-${name}\\.ts`));
}

const contractPackage = ['a', 'i'].join('');
const toolsPackage = ['@ai-', 'sdk/openai'].join('');
const scopedResult = withFixtures([
  { relativePath: 'packages/contract/src/boundary-isolation-contract-fixture.ts', source: `import '${contractPackage}';` },
  { relativePath: 'tools/boundary-isolation-tools-fixture.ts', source: `const provider = require('${toolsPackage}');` },
], runChecker);
assert.notEqual(scopedResult.status, 0, 'contract/tools fixtures were not rejected');
assert.match(scopedResult.stderr, /boundary-isolation-contract-fixture\.ts/);
assert.match(scopedResult.stderr, /boundary-isolation-tools-fixture\.ts/);

console.log('boundary-isolation: import-form and scan-scope assertions passed');
