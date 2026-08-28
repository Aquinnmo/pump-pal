import assert from 'node:assert/strict';

import { isValidUsername, slugifyUsername, USERNAME_REGEX } from './username.js';

// Keep the actual exported validator and its documented regex in lockstep.
assert.deepEqual(USERNAME_REGEX, /^[A-Za-z][A-Za-z0-9_]{2,19}$/);
for (const value of ['ab', 'a'.repeat(21), '1abc', '_abc', 'ab-c', '   ', '']) {
  assert.equal(isValidUsername(value), false, `invalid username accepted: ${JSON.stringify(value)}`);
}
for (const value of ['abc', 'a'.repeat(20), 'A_2']) {
  assert.equal(isValidUsername(value), true, `valid username rejected: ${JSON.stringify(value)}`);
}

assert.equal(slugifyUsername('Timber User'), 'timber_user');
assert.equal(slugifyUsername('123__Timber___'), 'timber');
assert.equal(slugifyUsername('___'), 'athlete');
assert.equal(slugifyUsername(`Timber${'_'.repeat(100_000)}`), 'timber');

// Non-ASCII characters are collapsed rather than transliterated. If nothing
// usable remains, the stable fallback is the only candidate that can pass the
// username validator.
assert.equal(slugifyUsername('Ünïcödé'), 'n_c_d');
assert.equal(slugifyUsername('日本'), 'athlete');

// Truncation occurs after trailing-underscore trimming, so a separator at the
// twentieth position can survive when more usable characters follow it.
assert.equal(slugifyUsername('abcdefghijklmnopqrs_tuvwxyz'), 'abcdefghijklmnopqrs_');
