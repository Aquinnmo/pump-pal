import assert from 'node:assert/strict';
import { decodeFields, encodeFields, ts } from './rest.js';

// Round-trip every value shape the domain routes need: string, integer,
// double, boolean, null, nested array, nested map, timestamp.
const input = {
  name: 'Bench Press',
  reps: 8,
  weight: 135.5,
  bodyweight: false,
  notes: null,
  tags: ['chest', 'push'],
  set: { setNumber: 1, reps: 8 },
  createdAt: ts('2026-08-05T12:00:00.000Z'),
};

const encoded = encodeFields(input);
assert.deepEqual(encoded.name, { stringValue: 'Bench Press' });
assert.deepEqual(encoded.reps, { integerValue: '8' });
assert.deepEqual(encoded.weight, { doubleValue: 135.5 });
assert.deepEqual(encoded.bodyweight, { booleanValue: false });
assert.deepEqual(encoded.notes, { nullValue: null });
assert.deepEqual(encoded.tags, { arrayValue: { values: [{ stringValue: 'chest' }, { stringValue: 'push' }] } });
assert.deepEqual(encoded.set, {
  mapValue: { fields: { setNumber: { integerValue: '1' }, reps: { integerValue: '8' } } },
});
assert.deepEqual(encoded.createdAt, { timestampValue: '2026-08-05T12:00:00.000Z' });

const decoded = decodeFields(encoded);
assert.deepEqual(decoded, {
  name: 'Bench Press',
  reps: 8,
  weight: 135.5,
  bodyweight: false,
  notes: null,
  tags: ['chest', 'push'],
  set: { setNumber: 1, reps: 8 },
  createdAt: '2026-08-05T12:00:00.000Z', // timestamps decode to the ISO string, not a Date/Timestamp
});

console.log('rest: all assertions passed');
