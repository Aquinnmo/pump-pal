import assert from 'node:assert/strict';
import type { Workout } from '@/types/workout';
import { recentExercisesForDay, toDateObj } from '@/utils/workout-conversion';

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

console.log('workout-conversion tests passed');
