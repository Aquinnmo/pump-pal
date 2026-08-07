import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY ??= 'test-key';

const { hasBaseVersionConflict } = await import('./pushup-challenge.js');

// Omitted baseVersion: last-write-wins, never conflicts.
assert.equal(hasBaseVersionConflict(undefined, 'v1'), false);
assert.equal(hasBaseVersionConflict(undefined, undefined), false);

// null baseVersion: caller expects no existing doc.
assert.equal(hasBaseVersionConflict(null, undefined), false); // correct: nothing there yet
assert.equal(hasBaseVersionConflict(null, 'v1'), true); // wrong: something's already there

// String baseVersion: must match exactly.
assert.equal(hasBaseVersionConflict('v1', 'v1'), false);
assert.equal(hasBaseVersionConflict('v1', 'v2'), true);
assert.equal(hasBaseVersionConflict('v1', undefined), true); // claimed a version but doc is gone

console.log('pushup-challenge: all assertions passed');
