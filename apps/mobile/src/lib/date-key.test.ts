import assert from 'node:assert/strict';
import { toDateKey } from './date-key';

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

withTimeZone('America/Los_Angeles', () => {
  assert.equal(
    toDateKey(new Date('2026-01-01T05:00:00.000Z')),
    '2025-12-31',
    'local date can be the previous UTC calendar day west of Greenwich',
  );
  assert.equal(
    toDateKey(new Date('2026-01-05T12:00:00.000Z')),
    '2026-01-05',
    'local date keys zero-pad January and day 5',
  );

  // America/Los_Angeles jumps from 01:59:59 to 03:00:00 on this date. Both
  // instants remain on the same local calendar day across the transition.
  assert.equal(toDateKey(new Date('2026-03-08T09:30:00.000Z')), '2026-03-08');
  assert.equal(toDateKey(new Date('2026-03-08T10:30:00.000Z')), '2026-03-08');
});

withTimeZone('Asia/Tokyo', () => {
  assert.equal(
    toDateKey(new Date('2026-08-27T23:30:00.000Z')),
    '2026-08-28',
    'local date can be the next UTC calendar day east of Greenwich',
  );
});

console.log('date-key: all assertions passed');
