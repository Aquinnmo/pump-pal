#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CHECKER = path.join(__dirname, 'check-direct-boundaries.js');
const WORKER = path.join(ROOT, 'apps/api/src/worker.ts');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

function runChecker() {
  return spawnSync(process.execPath, [CHECKER], { cwd: ROOT, encoding: 'utf8' });
}

const baseline = runChecker();
assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);

// The scanner intentionally searches the whole Worker source, comments
// included. A lowercase spelling in a comment must therefore fail the guard.
const originalWorker = fs.readFileSync(WORKER, 'utf8');
try {
  fs.writeFileSync(WORKER, `${originalWorker}\n// firestore boundary-fixture\n`);
  const commentViolation = runChecker();
  assert.notEqual(commentViolation.status, 0, 'lowercase firestore comment was not rejected');
  assert.match(commentViolation.stderr, /direct-boundaries failed:/);
  assert.match(commentViolation.stderr, /direct Firestore proxy surface/);
} finally {
  fs.writeFileSync(WORKER, originalWorker);
}

const restored = runChecker();
assert.equal(restored.status, 0, restored.stderr || restored.stdout);

const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
assert.match(packageJson.scripts['test:tools'], /check:direct-boundaries/);

console.log('direct-boundaries: comment-sensitive behavior and test-runner wiring assertions passed');
