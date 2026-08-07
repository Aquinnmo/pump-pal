import assert from 'node:assert/strict';
import { normalizeTimestampsDeep, toIsoString } from './normalize-timestamps';

// --- plain {seconds,nanoseconds} (legacy/migrated Firestore data) ---
assert.equal(toIsoString({ seconds: 1750000000, nanoseconds: 0 }), new Date(1750000000 * 1000).toISOString());

// --- Date passes through as ISO ---
const d = new Date('2026-01-01T00:00:00.000Z');
assert.equal(toIsoString(d), '2026-01-01T00:00:00.000Z');

// --- ISO string is idempotent ---
assert.equal(toIsoString('2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');

// --- duck-typed Firestore Timestamp instance (getters, not own properties) ---
class FakeTimestamp {
  constructor(private _seconds: number, private _nanoseconds: number) {}
  get seconds() {
    return this._seconds;
  }
  get nanoseconds() {
    return this._nanoseconds;
  }
}
const ts = new FakeTimestamp(1740000000, 500000000);
assert.equal(toIsoString(ts as any), new Date(1740000000 * 1000 + 500).toISOString());

// --- recursive: nested arrays/objects, mixed already-ISO and Timestamp-shaped fields ---
const input = {
  workoutSplit: { type: 'Push / Pull / Legs', custom: null, updatedAt: { seconds: 1, nanoseconds: 0 } },
  injuries: [
    { id: 'a', onsetDate: '2026-01-01T00:00:00.000Z', createdAt: new FakeTimestamp(2, 0) },
    { id: 'b', onsetDate: { seconds: 3, nanoseconds: 0 }, resolvedDate: null },
  ],
};
const out = normalizeTimestampsDeep(input) as any;
assert.equal(out.workoutSplit.updatedAt, new Date(1000).toISOString());
assert.equal(out.injuries[0].onsetDate, '2026-01-01T00:00:00.000Z');
assert.equal(out.injuries[0].createdAt, new Date(2000).toISOString());
assert.equal(out.injuries[1].onsetDate, new Date(3000).toISOString());
assert.equal(out.injuries[1].resolvedDate, null);
// Non-timestamp fields are untouched.
assert.equal(out.workoutSplit.type, 'Push / Pull / Legs');
assert.equal(out.injuries[0].id, 'a');

console.log('db/normalize-timestamps.test.ts: all assertions passed');
