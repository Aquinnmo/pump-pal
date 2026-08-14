import assert from 'node:assert/strict';
import { TEMPORARY_AI_DAILY_LIMIT } from '@timber/contract/ai';
import { decodeFields, encodeFields } from './rest.js';
import { isAIEnabledField, nextUsage, quotaStatus, todayUTC } from './quota.js';

// Fixed dates so the test never depends on the wall clock.
const TODAY = '2026-08-03';
const YESTERDAY = '2026-08-02';
const LIMIT = TEMPORARY_AI_DAILY_LIMIT;

// No record yet: first call of the user's life.
assert.deepEqual(nextUsage(undefined, TODAY), { date: TODAY, count: 1 });

// Within the same day the counter walks up to the limit.
assert.deepEqual(nextUsage({ date: TODAY, count: LIMIT - 1 }, TODAY), { date: TODAY, count: LIMIT });

// At the limit, the claim is refused.
assert.equal(nextUsage({ date: TODAY, count: LIMIT }, TODAY), null);

// Defensive: a counter above the limit (manual edit, changed limit) stays refused.
assert.equal(nextUsage({ date: TODAY, count: 99 }, TODAY), null);

// A stale record rolls over instead of blocking — this is what makes the quota
// reset daily without a scheduled job.
assert.deepEqual(nextUsage({ date: YESTERDAY, count: LIMIT }, TODAY), { date: TODAY, count: 1 });

// quotaStatus is what GET /api/ai/quota serves — the client renders `remaining`
// rather than deriving it from a bundled limit, so these two must agree with
// nextUsage or the button and the enforcement disagree.

// No record: a full quota, and the limit travels with it.
assert.deepEqual(quotaStatus(undefined, TODAY), { remaining: LIMIT, limit: LIMIT, date: TODAY });

// Today's record is subtracted.
assert.equal(quotaStatus({ date: TODAY, count: 2 }, TODAY).remaining, LIMIT - 2);

// Same rollover as nextUsage: yesterday's record reads as a full quota.
assert.equal(quotaStatus({ date: YESTERDAY, count: LIMIT }, TODAY).remaining, LIMIT);

// At the limit, zero — and nextUsage refuses at exactly the same point.
assert.equal(quotaStatus({ date: TODAY, count: LIMIT }, TODAY).remaining, 0);
assert.equal(nextUsage({ date: TODAY, count: LIMIT }, TODAY), null);

// Never negative: a lowered limit must not render as "-3 left".
assert.equal(quotaStatus({ date: TODAY, count: 99 }, TODAY, 10).remaining, 0);

// todayUTC is UTC, not local: 00:30 UTC belongs to that UTC day regardless of
// the server's timezone.
assert.equal(todayUTC(new Date('2026-08-03T00:30:00Z')), '2026-08-03');
assert.equal(todayUTC(new Date('2026-08-03T23:59:59Z')), '2026-08-03');

// Firestore REST value codec: round-trip the two shapes this code touches.
// integerValue is a STRING on the wire — encodeFields must produce that, and
// decodeFields must turn it back into a JS number.
const encodedUsage = encodeFields({ aiUsage: { date: TODAY, count: 2 } });
assert.deepEqual(encodedUsage, {
  aiUsage: {
    mapValue: {
      fields: {
        date: { stringValue: TODAY },
        count: { integerValue: '2' },
      },
    },
  },
});
assert.deepEqual(decodeFields(encodedUsage), { aiUsage: { date: TODAY, count: 2 } });

const encodedName = encodeFields({ name: 'Aldric' });
assert.deepEqual(encodedName, { name: { stringValue: 'Aldric' } });
assert.deepEqual(decodeFields(encodedName), { name: 'Aldric' });

// AI opt-in fails closed: only a literal `true` enables it. A missing doc, a
// missing field, and every truthy near-miss all mean "this user did not agree
// to have their workout history sent to a provider".
assert.equal(isAIEnabledField(true), true);
for (const value of [undefined, null, false, 'true', 1, {}, []]) {
  assert.equal(isAIEnabledField(value), false, `aiEnabled=${JSON.stringify(value) ?? 'undefined'} must not enable AI`);
}

console.log('quota: all assertions passed');
