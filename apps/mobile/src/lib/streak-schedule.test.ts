import assert from 'node:assert/strict';
import { dayNumberOn, nextFireAt } from './streak-schedule';

// The reminder hour is inclusive: at the exact hour, and after it, the next
// occurrence is tomorrow. skipToday also always advances the date.
{
  const now = new Date(2026, 7, 27, 18, 0, 0, 0);
  const exact = nextFireAt(18, now, false);
  assert.equal(exact.getFullYear(), 2026);
  assert.equal(exact.getMonth(), 7);
  assert.equal(exact.getDate(), 28);
  assert.equal(exact.getHours(), 18);

  const passed = nextFireAt(18, new Date(2026, 7, 27, 18, 1, 0, 0), false);
  assert.equal(passed.getDate(), 28);
  assert.equal(passed.getHours(), 18);

  const skipped = nextFireAt(18, new Date(2026, 7, 27, 12, 0, 0, 0), true);
  assert.equal(skipped.getDate(), 28);
  assert.equal(skipped.getHours(), 18);
}

const originalTZ = process.env.TZ;

function withTimeZone<T>(timeZone: string, fn: () => T): T {
  process.env.TZ = timeZone;
  try {
    return fn();
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
}

// Comparing UTC midnights keeps a spring-forward local day from counting as
// less than one challenge day (and the same for a 25-hour fall-back day).
withTimeZone('America/New_York', () => {
  assert.equal(dayNumberOn('2026-03-07', new Date('2026-03-07T23:59:59-05:00')), 1);
  assert.equal(dayNumberOn('2026-03-07', new Date('2026-03-08T12:00:00-04:00')), 2);
  assert.equal(dayNumberOn('2026-03-07', new Date('2026-03-09T12:00:00-04:00')), 3);

  assert.equal(dayNumberOn('2026-10-31', new Date('2026-11-01T12:00:00-05:00')), 2);
});

console.log('streak-schedule: all assertions passed');
