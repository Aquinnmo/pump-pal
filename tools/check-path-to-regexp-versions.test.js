#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const lockfile = readFileSync(join(__dirname, '..', 'bun.lock'), 'utf8');
const minimumVersions = {
  'path-to-regexp': '0.1.12',
  'superstatic/path-to-regexp': '1.9.0',
  'router/path-to-regexp': '8.0.0',
};

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  assert.equal(actualParts.length, 3, `invalid path-to-regexp version ${actual}`);
  assert.ok(actualParts.every(Number.isInteger), `invalid path-to-regexp version ${actual}`);

  for (let index = 0; index < actualParts.length; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return actualParts[index] > minimumParts[index];
    }
  }
  return true;
}

for (const [alias, minimum] of Object.entries(minimumVersions)) {
  const prefix = `\"${alias}\": [\"path-to-regexp@`;
  const entry = lockfile.split('\n').find((line) => line.includes(prefix));
  assert.ok(entry, `bun.lock must resolve ${alias}`);

  const version = entry.slice(entry.indexOf(prefix) + prefix.length).split('\"', 1)[0];
  assert.ok(
    versionAtLeast(version, minimum),
    `${alias} resolves path-to-regexp@${version}; expected at least ${minimum}`,
  );
}

console.log('check-path-to-regexp-versions: all lockfile resolutions meet patched floors');
