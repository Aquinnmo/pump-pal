#!/usr/bin/env node
/**
 * Static guardrails for the post-cutover trust split. This intentionally uses
 * plain source checks: they are cheap, run without Firebase credentials, and
 * catch a regression before a client can route owner-safe data through the
 * Worker again.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const mobileRemote = (name) => readFileSync(join(root, 'apps/mobile/src/data/remote', name), 'utf8');
const worker = readFileSync(join(root, 'apps/api/src/worker.ts'), 'utf8');
const failures = [];

for (const [file, forbidden] of [
  ['catalog.ts', /getCatalog/],
  ['injuries.ts', /\b(listInjuries|createInjury|updateInjury|deleteInjury)\b/],
  ['profile.ts', /\bgetProfile\b/],
]) {
  if (forbidden.test(mobileRemote(file))) failures.push(`${file} still exposes a retired safe Worker operation`);
}

for (const path of ['/api/workouts', '/api/pushup-challenge', '/api/sync/']) {
  if (!worker.includes(path)) failures.push(`Worker is missing the ${path} cutover tombstone`);
}

if (/firestore|commit|runQuery|getDocument/.test(worker)) {
  failures.push('Worker source contains a direct Firestore proxy surface');
}

if (failures.length) {
  console.error('direct-boundaries failed:\n' + failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}

console.log('direct-boundaries: safe data stays direct; Worker remains privileged-only with upgrade tombstones');
