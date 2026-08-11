import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY ??= 'test-key';

const { groupByKind } = await import('./sync.js');

// Every kind bucket exists even when empty, so callers never need an `?? []`.
{
  const grouped = groupByKind([]);
  assert.deepEqual(grouped, { workout: [], injury: [], profile: [], pushupChallenge: [] });
}

// Mixed kinds land in the right bucket, in request order, one read-batch per kind.
{
  const grouped = groupByKind([
    { kind: 'workout', id: 'w1' },
    { kind: 'injury', id: 'i1' },
    { kind: 'workout', id: 'w2' },
    { kind: 'profile', id: 'uid1' },
    { kind: 'pushupChallenge', id: 'uid1' },
    { kind: 'injury', id: 'i2' },
  ]);
  assert.deepEqual(grouped.workout, ['w1', 'w2']);
  assert.deepEqual(grouped.injury, ['i1', 'i2']);
  assert.deepEqual(grouped.profile, ['uid1']);
  assert.deepEqual(grouped.pushupChallenge, ['uid1']);
}

console.log('sync: all assertions passed');
