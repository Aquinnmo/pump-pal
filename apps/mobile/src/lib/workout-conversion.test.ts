import assert from 'node:assert/strict';
import type { DraftSet, Workout } from '@/types/workout';
import { collapseSetsToDraft, normalizeDraftSets, recentExercisesForDay, toDateObj } from '@/lib/workout-conversion';

const ISO = '2026-08-05T12:30:00.000Z';
const MILLIS = new Date(ISO).getTime();

assert.equal(toDateObj(new Date(ISO))?.getTime(), MILLIS);
assert.equal(toDateObj(ISO)?.getTime(), MILLIS);
assert.equal(toDateObj(MILLIS)?.getTime(), MILLIS);
assert.equal(toDateObj({ seconds: MILLIS / 1000, nanoseconds: 0 })?.getTime(), MILLIS);
assert.equal(toDateObj({ toDate: () => new Date(ISO) })?.getTime(), MILLIS);

assert.equal(toDateObj(undefined), null);
assert.equal(toDateObj(null), null);
assert.equal(toDateObj('not-a-date'), null);
assert.equal(toDateObj({ seconds: Number.NaN, nanoseconds: 0 }), null);
assert.equal(toDateObj({ toDate: () => { throw new Error('bad timestamp'); } }), null);

const baseWorkout: Workout = {
  id: 'valid',
  userId: 'user',
  name: 'Push',
  date: ISO,
  status: 'completed',
  performedExercises: [{
    order: 0,
    exerciseId: 'bench-press',
    exerciseRefPath: 'exercises/bench-press',
    exerciseNameSnapshot: 'Bench Press',
    variationId: null,
    variationNameSnapshot: null,
    sets: [],
  }],
  schemaVersion: 2,
};

const invalidWorkout: Workout = {
  ...baseWorkout,
  id: 'invalid',
  date: undefined,
};

assert.deepEqual(
  recentExercisesForDay([invalidWorkout, baseWorkout], 'Push', new Date('2026-08-06T00:00:00.000Z')),
  [{ exerciseId: 'bench-press', variationId: null, label: 'Bench Press' }],
);

// normalizeDraftSets: mode wins; no repeats → median; tied modes → median of the
// tied sets; even counts take the upper (heavier) middle.
const set = (reps: number, weight: string, completed?: boolean): DraftSet =>
  ({ reps, weight, durationMinutes: 0, durationSeconds: 0, completed });
const pairs = (sets: DraftSet[]) => sets.map((s) => `${s.reps}x${s.weight}`);

assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(10, '100'), set(8, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(12, '95'), set(8, '105'), set(10, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(8, '110')])), ['8x110', '8x110']);
assert.deepEqual(
  pairs(normalizeDraftSets([set(10, '100'), set(10, '100'), set(8, '110'), set(8, '110')])),
  ['8x110', '8x110', '8x110', '8x110'],
);
assert.deepEqual(
  pairs(normalizeDraftSets([set(6, '120'), set(6, '120'), set(10, '100'), set(10, '100'), set(8, '110'), set(8, '110')])),
  ['8x110', '8x110', '8x110', '8x110', '8x110', '8x110'],
);
// Same weight: reps break the order. "100" and "100.0" are the same set.
assert.deepEqual(pairs(normalizeDraftSets([set(12, '100'), set(8, '100.0'), set(10, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(8, '100.0'), set(8, '100')])), ['8x100.0', '8x100.0', '8x100.0']);
// One set is left alone; each slot keeps its own completed flag.
assert.deepEqual(pairs(normalizeDraftSets([set(7, '50')])), ['7x50']);
assert.deepEqual(
  normalizeDraftSets([set(10, '100', true), set(10, '100', false), set(9, '100')]).map((s) => s.completed),
  [true, false, undefined],
);
// Duration sets normalize on their duration.
const hold = (seconds: number): DraftSet => ({ reps: 0, weight: '', durationMinutes: Math.floor(seconds / 60), durationSeconds: seconds % 60 });
assert.deepEqual(
  normalizeDraftSets([hold(60), hold(45), hold(30)]).map((s) => [s.durationMinutes, s.durationSeconds]),
  [[0, 45], [0, 45], [0, 45]],
);

// collapseSetsToDraft only normalizes when asked.
const uneven = {
  ...baseWorkout.performedExercises![0]!,
  sets: [
    { setNumber: 1, reps: 10, weight: 100 },
    { setNumber: 2, reps: 10, weight: 100 },
    { setNumber: 3, reps: 6, weight: 100 },
  ],
};
assert.deepEqual(pairs(collapseSetsToDraft(uneven).sets), ['10x100', '10x100', '6x100']);
assert.deepEqual(pairs(collapseSetsToDraft(uneven, true).sets), ['10x100', '10x100', '10x100']);

console.log('workout-conversion tests passed');
