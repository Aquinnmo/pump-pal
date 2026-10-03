import assert from 'node:assert/strict';
import { SET_TYPES, setTypeOf } from '@/constants/set-types';

// Absent and unknown ids (from a newer build) both read as normal.
assert.equal(setTypeOf({}).id, 'normal');
assert.equal(setTypeOf(undefined).id, 'normal');
assert.equal(setTypeOf({ type: 'future-type' }).id, 'normal');
assert.equal(setTypeOf({ type: 'drop' }).id, 'drop');

// Every row is complete, ids and labels are unique (the sheet maps label back to id),
// and normal comes first because setTypeOf falls back to it.
assert.equal(SET_TYPES[0].id, 'normal');
assert.equal(new Set(SET_TYPES.map((t) => t.id)).size, SET_TYPES.length);
assert.equal(new Set(SET_TYPES.map((t) => t.label)).size, SET_TYPES.length);
for (const t of SET_TYPES) assert.ok(t.label && t.description, t.id);
// Sub-set types name their parts and say how much lighter each new one starts.
for (const t of SET_TYPES.filter((t) => t.subSet)) {
  assert.ok(t.subSet!.noun, t.id);
  assert.ok(t.subSet!.weightFactor > 0 && t.subSet!.weightFactor <= 1, t.id);
}
