import assert from 'node:assert/strict';
import { BODY_PART_MUSCLES } from './body-parts';
import { MUSCLES, MUSCLE_REGIONS } from './muscles';
import { SPLIT_OPTIONS } from './split-options';
import { SPLIT_WORKOUT_NAMES } from './split-workout-names';

// The six regions are an exhaustive, non-overlapping partition of the
// canonical muscle list.
const regionMuscles = Object.values(MUSCLE_REGIONS).flat();
assert.equal(Object.keys(MUSCLE_REGIONS).length, 6, 'there are six muscle regions');
assert.equal(regionMuscles.length, MUSCLES.length, 'regions contain one entry per canonical muscle');
assert.deepEqual(
  [...new Set(regionMuscles)].sort(),
  [...MUSCLES].sort(),
  'regions cover every canonical muscle exactly once',
);

// Injury body-part mappings may only point at canonical muscles.
const canonicalMuscles = new Set<string>(MUSCLES);
for (const [bodyPart, muscles] of Object.entries(BODY_PART_MUSCLES)) {
  for (const muscle of muscles) {
    assert.ok(canonicalMuscles.has(muscle), `${bodyPart} maps only to canonical muscles: ${muscle}`);
  }
}

// Every split option has a name list, with Other intentionally representing a
// custom split and therefore mapping to no preset names.
assert.deepEqual(
  Object.keys(SPLIT_WORKOUT_NAMES).sort(),
  [...SPLIT_OPTIONS].sort(),
  'split workout names cover every split option',
);
assert.deepEqual(SPLIT_WORKOUT_NAMES.Other, [], 'Other has no preset workout names');

console.log('constant invariants: all assertions passed');
