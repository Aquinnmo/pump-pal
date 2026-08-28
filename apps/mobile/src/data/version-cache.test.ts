import assert from 'node:assert/strict';
import { createVersionCache } from './version-cache';

const cache = createVersionCache();

assert.equal(cache.get('workout-1'), undefined, 'a new cache has no version');
cache.set('workout-1', 'v1');
assert.equal(cache.get('workout-1'), 'v1');
assert.equal(cache.require('workout-1', 'workout'), 'v1');

assert.throws(
  () => cache.require('missing', 'injury'),
  /No cached version for injury missing/,
  'mutations without a preceding read fail at the cache seam'
);

cache.set('workout-1', 'v2');
assert.equal(cache.require('workout-1', 'workout'), 'v2', 'a later read replaces the base version');
cache.delete('workout-1');
assert.equal(cache.get('workout-1'), undefined, 'delete removes the version after a successful deletion');

console.log('src/data/version-cache.test.ts: all assertions passed');
