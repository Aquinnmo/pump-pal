#!/usr/bin/env node
/*
 * Plans the copy-before-cleanup Firestore trust-domain migration.
 *
 * This file is deliberately pure by default: pass a JSON snapshot containing
 * `{ users: { uid: { injuries, aiUsage, expoPushToken } }, exercises: {} }`
 * and it only reports the exact destination documents. A future authorized
 * operator can feed the same plan to the service-account runner; no command
 * here contacts Firebase or removes legacy fields.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function document(path, fields, source) {
  return { path, fields, source, hash: hash(fields) };
}

function planTrustDomainMigration(snapshot) {
  const copies = [];
  const users = snapshot.users ?? {};
  for (const [uid, user] of Object.entries(users)) {
    for (const injury of user.injuries ?? []) {
      if (!injury?.id || String(injury.id).includes('/')) throw new Error(`Invalid injury id for ${uid}`);
      copies.push(document(`users/${uid}/injuries/${injury.id}`, injury, `users/${uid}.injuries/${injury.id}`));
    }
    if (user.aiUsage) copies.push(document(`users/${uid}/private/aiUsage`, user.aiUsage, `users/${uid}.aiUsage`));
    if (user.expoPushToken) copies.push(document(`users/${uid}/private/notifications`, { expoPushToken: user.expoPushToken }, `users/${uid}.expoPushToken`));
  }
  for (const [id, exercise] of Object.entries(snapshot.exercises ?? {})) {
    if (exercise.status === undefined) copies.push(document(`exercises/${id}`, { status: 'approved' }, `exercises/${id}.status`));
  }
  return copies.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Copies only missing destinations. This is intentionally more conservative
 * than a timestamp comparison: an existing document is never overwritten,
 * so a newer destination cannot be lost through a stale migration snapshot.
 */
async function copyMigrationPlan(plan, store) {
  const result = { copied: [], skippedExisting: [] };
  for (const target of plan) {
    if (await store.get(target.path)) {
      result.skippedExisting.push(target.path);
      continue;
    }
    await store.create(target.path, target.fields);
    result.copied.push(target.path);
  }
  return result;
}

function verifyMigrationPlan(plan, destination) {
  const expected = new Map(plan.map((item) => [item.path, item.hash]));
  const actual = new Map(Object.entries(destination).map(([path, fields]) => [path, hash(fields)]));
  const missing = [...expected.keys()].filter((path) => !actual.has(path));
  const mismatched = [...expected.keys()].filter((path) => actual.has(path) && actual.get(path) !== expected.get(path));
  return {
    expectedCount: expected.size,
    foundCount: [...expected.keys()].filter((path) => actual.has(path)).length,
    missing,
    mismatched,
    verified: missing.length === 0 && mismatched.length === 0,
    expectedHash: hash(Object.fromEntries(expected)),
    actualHash: hash(Object.fromEntries([...actual].filter(([path]) => expected.has(path)))),
  };
}

function run(argv) {
  const snapshotFlag = argv.indexOf('--snapshot');
  if (snapshotFlag === -1 || !argv[snapshotFlag + 1]) {
    throw new Error('Usage: node tools/migrate-trust-domains.js --snapshot path.json [--verify destination.json]');
  }
  const snapshot = JSON.parse(fs.readFileSync(argv[snapshotFlag + 1], 'utf8'));
  const plan = planTrustDomainMigration(snapshot);
  const verifyFlag = argv.indexOf('--verify');
  if (verifyFlag !== -1) {
    const destination = JSON.parse(fs.readFileSync(argv[verifyFlag + 1], 'utf8'));
    console.log(JSON.stringify(verifyMigrationPlan(plan, destination), null, 2));
    return;
  }
  console.log(JSON.stringify({ mode: 'dry-run', copies: plan.length, plan }, null, 2));
}

if (require.main === module) {
  try { run(process.argv); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { copyMigrationPlan, hash, planTrustDomainMigration, stableJson, verifyMigrationPlan };
