#!/usr/bin/env node
const assert = require('node:assert/strict');
const { overrides = {} } = require('../package.json');

for (const [name, value] of Object.entries(overrides)) {
  assert.equal(
    typeof value,
    'string',
    `Bun supports only top-level string overrides; ${name} must not use a nested override`,
  );
}

console.log('check-bun-overrides: all overrides use Bun-supported syntax');
