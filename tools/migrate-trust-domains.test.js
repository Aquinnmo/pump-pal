const assert = require('node:assert/strict');
const {
  copyMigrationPlan,
  hash,
  planTrustDomainMigration,
  stableJson,
  verifyMigrationPlan,
} = require('./migrate-trust-domains');

const plan = planTrustDomainMigration({
  users: {
    uid1: {
      injuries: [{ id: 'inj-a', status: 'ongoing' }, { id: 'inj-b', status: 'resolved' }],
      aiUsage: { date: '2026-08-12', count: 2 },
      expoPushToken: 'ExponentPushToken[token]',
    },
  },
  exercises: { bench: { name: 'Bench Press' }, pending: { status: 'pending_review' } },
});

assert.deepEqual(plan.map((item) => item.path), [
  'exercises/bench',
  'users/uid1/injuries/inj-a',
  'users/uid1/injuries/inj-b',
  'users/uid1/private/aiUsage',
  'users/uid1/private/notifications',
]);

// Dry-run planning is pure and deterministic.
const deterministicSnapshot = { users: { uid1: { injuries: [{ id: 'inj-a', status: 'ongoing' }], aiUsage: { date: 'x', count: 1 } } } };
assert.deepEqual(planTrustDomainMigration(deterministicSnapshot), planTrustDomainMigration(deterministicSnapshot));
const firstOrdering = { z: 1, nested: { b: true, a: ['x', 2] }, a: null };
const secondOrdering = { a: null, nested: { a: ['x', 2], b: true }, z: 1 };
assert.equal(stableJson(firstOrdering), stableJson(secondOrdering));
assert.equal(hash(firstOrdering), hash(secondOrdering));

assert.throws(
  () => planTrustDomainMigration({ users: { uid1: { injuries: [{ id: 'invalid/id' }] } } }),
  /Invalid injury id for uid1/
);
assert.deepEqual(
  planTrustDomainMigration({
    exercises: {
      missingStatus: { name: 'Missing status' },
      nullStatus: { status: null },
      emptyStatus: { status: '' },
      approved: { status: 'approved' },
    },
  }).map((item) => item.path),
  ['exercises/missingStatus']
);

void (async () => {
  const docs = new Map([['users/uid1/injuries/inj-a', { id: 'inj-a', status: 'newer' }]]);
  const created = [];
  const result = await copyMigrationPlan(plan, {
    get: async (path) => docs.get(path),
    create: async (path, fields) => {
      created.push(path);
      docs.set(path, fields);
    },
  });
  assert.deepEqual(result.skippedExisting, ['users/uid1/injuries/inj-a']);
  assert.ok(!created.includes('users/uid1/injuries/inj-a'));
  assert.equal(docs.get('users/uid1/injuries/inj-a').status, 'newer'); // never overwrite a newer destination
  assert.equal(result.copied.length, 4);

  // Re-running the exact plan is idempotent: every existing destination is skipped.
  const rerun = await copyMigrationPlan(plan, {
    get: async (path) => docs.get(path),
    create: async (path, fields) => docs.set(path, fields),
  });
  assert.equal(rerun.copied.length, 0);
  assert.equal(rerun.skippedExisting.length, plan.length);

  const destination = Object.fromEntries(docs);
  const verification = verifyMigrationPlan(plan, destination);
  assert.equal(verification.verified, false); // newer doc is intentionally surfaced, not silently accepted
  assert.deepEqual(verification.mismatched, ['users/uid1/injuries/inj-a']);
  docs.set('users/uid1/injuries/inj-a', { id: 'inj-a', status: 'ongoing' });
  assert.equal(verifyMigrationPlan(plan, Object.fromEntries(docs)).verified, true);
  console.log('migrate-trust-domains: all assertions passed');
})();
