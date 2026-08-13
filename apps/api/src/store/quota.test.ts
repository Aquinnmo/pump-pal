import assert from 'node:assert/strict';
import { TEMPORARY_AI_DAILY_LIMIT } from '@timber/contract/ai';
import { decodeFields, encodeFields } from './rest.js';
import { nextUsage, todayUTC } from './quota.js';

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

console.log('quota: all assertions passed');
