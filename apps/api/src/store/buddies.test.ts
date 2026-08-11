import assert from 'node:assert/strict';

// buddies.ts pulls in ApiError from http.js, whose cold-start env check runs
// at import time -- same reason router.test.ts sets these before importing.
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';

const { CHOP_COOLDOWN_MS, chopCooldownRemainingMs, currentStreak, pairId } = await import('./buddies.js');

// --- pairId: the collision that makes friendships unique -------------------

// Same pair, either argument order, one id -- this is what makes the
// `{ exists: false }` precondition a real uniqueness guard.
assert.equal(pairId('bbb', 'aaa'), pairId('aaa', 'bbb'));
assert.equal(pairId('aaa', 'bbb'), 'aaa_bbb');
assert.notEqual(pairId('aaa', 'bbb'), pairId('aaa', 'ccc'));

// --- currentStreak ---------------------------------------------------------

const days = (...dates: string[]) => dates.map((date) => ({ date }));

// No challenge at all.
assert.equal(currentStreak(null, [], '2026-01-05'), 0);
assert.equal(currentStreak('2026-01-01', [], '2026-01-05'), 0);

// Every day through yesterday done, today still open -- alive, today doesn't
// have to be complete for the streak to count.
assert.equal(currentStreak('2026-01-01', days('2026-01-01', '2026-01-02'), '2026-01-03'), 2);

// Today also done.
assert.equal(currentStreak('2026-01-01', days('2026-01-01', '2026-01-02', '2026-01-03'), '2026-01-03'), 3);

// A gap before today kills it outright: the run is over, so "current" is 0
// rather than the two days that preceded the gap.
assert.equal(currentStreak('2026-01-01', days('2026-01-01', '2026-01-02', '2026-01-05'), '2026-01-06'), 0);

// Missed yesterday specifically.
assert.equal(currentStreak('2026-01-01', days('2026-01-01'), '2026-01-03'), 0);

// Out-of-order days are still counted -- the stored array has no ordering guarantee.
assert.equal(currentStreak('2026-01-01', days('2026-01-02', '2026-01-01'), '2026-01-03'), 2);

// Crossing a month boundary.
assert.equal(currentStreak('2026-01-30', days('2026-01-30', '2026-01-31', '2026-02-01'), '2026-02-01'), 3);

// --- chop cooldown ---------------------------------------------------------

const t0 = Date.parse('2026-01-01T12:00:00.000Z');

// Never chopped -> available.
assert.equal(chopCooldownRemainingMs(undefined, t0), 0);

// Just chopped -> full cooldown.
assert.equal(chopCooldownRemainingMs(new Date(t0).toISOString(), t0), CHOP_COOLDOWN_MS);

// Halfway through.
assert.equal(chopCooldownRemainingMs(new Date(t0 - CHOP_COOLDOWN_MS / 2).toISOString(), t0), CHOP_COOLDOWN_MS / 2);

// Exactly expired, and well past -- never negative.
assert.equal(chopCooldownRemainingMs(new Date(t0 - CHOP_COOLDOWN_MS).toISOString(), t0), 0);
assert.equal(chopCooldownRemainingMs(new Date(t0 - CHOP_COOLDOWN_MS * 10).toISOString(), t0), 0);

console.log('buddies: all assertions passed');
