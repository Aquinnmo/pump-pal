import assert from 'node:assert/strict';

import { slugifyUsername } from './username';

assert.equal(slugifyUsername('Timber User'), 'timber_user');
assert.equal(slugifyUsername('123__Timber___'), 'timber');
assert.equal(slugifyUsername('___'), 'athlete');
assert.equal(slugifyUsername(`Timber${'_'.repeat(100_000)}`), 'timber');
