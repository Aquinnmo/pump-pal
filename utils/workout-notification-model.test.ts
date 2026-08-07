import assert from 'node:assert/strict';

import type { DraftExerciseRow, DraftSet } from '@/types/workout';
import { buildWorkoutNotificationPresentation } from '@/utils/workout-notification-model';

const set = (over: Partial<DraftSet> = {}): DraftSet => ({
  reps: 10,
  weight: '135',
  durationMinutes: 0,
  durationSeconds: 0,
  completed: false,
  ...over,
});

const row = (label: string, sets: DraftSet[], over: Partial<DraftExerciseRow> = {}): DraftExerciseRow => ({
  uid: `uid_${label}`,
  exerciseId: 'exercise',
  variationId: null,
  label,
  exerciseType: 'Sets of Reps',
  bodyweight: false,
  sets,
  ...over,
});

const present = (rows: DraftExerciseRow[], workoutName = 'Push') =>
  buildWorkoutNotificationPresentation({
    workoutId: 'workout-1',
    workoutName,
    startedAt: new Date(123),
    rows,
  });

const weighted = present([
  row('Bench Press', [set({ completed: true }), set({ completed: true }), set({ completed: true })]),
  row('Incline Press', Array.from({ length: 18 }, () => set())),
  row('', [set()]),
]);
assert.deepEqual([weighted.completedSets, weighted.totalSets], [3, 21]);
assert.equal(weighted.title, 'Logging Push Workout');
assert.equal(weighted.detail, 'Incline Press · 10 reps · 135 lbs');
assert.deepEqual(weighted.actions, ['completeSet', 'uncompleteSet']);
assert.deepEqual(weighted.segments, [
  { sets: 3, started: true, completed: true },
  { sets: 18, started: false, completed: false },
]);

// Partly-logged exercises are the amber state on the AOD: started but not completed.
const partial = present([
  row('Squat', [set({ completed: true }), set()]),
  row('Lunge', [set(), set()]),
]);
assert.deepEqual(partial.segments, [
  { sets: 2, started: true, completed: false },
  { sets: 2, started: false, completed: false },
]);

assert.equal(present([row('Bench', [set()])], 'Upper Workout').title, 'Logging Upper Workout');
assert.equal(present([row('Bench', [set()])], '').title, 'Logging Workout');

// The current set follows the last completed one, not the first gap.
const skipped = present([row('Bench', [set(), set({ completed: true }), set()])]);
assert.equal(skipped.detail, 'Bench · 10 reps · 135 lbs');

const first = present([row('Bench', [set()])]);
assert.equal(first.detail, 'Bench · 10 reps · 135 lbs');
assert.deepEqual(first.actions, ['completeSet']);

const advanced = present([row('Bench', [set({ reps: 5, completed: true }), set({ reps: 8 })])]);
assert.equal(advanced.detail, 'Bench · 8 reps · 135 lbs');
assert.equal(present([row('Bench', [set({ reps: 1 })])]).detail, 'Bench · 1 rep · 135 lbs');
assert.equal(present([row('Bench', [set({ reps: 0 })])]).detail, 'Bench · 135 lbs');
assert.equal(present([row('Bench', [set({ reps: Number.NaN })])]).detail, 'Bench · 135 lbs');

const bodyweight = present([row('Pull-up', [set({ weight: '200' })], { bodyweight: true })]);
assert.equal(bodyweight.detail, 'Pull-up · 10 reps');
assert.equal(present([row('Bench', [set({ weight: '0' })])]).detail, 'Bench · 10 reps');

const duration = present([
  row('Plank', [set({ durationMinutes: 1, durationSeconds: 5 })], { exerciseType: 'Sets of Duration' }),
]);
assert.equal(duration.detail, 'Plank · 1:05');
assert.equal(
  present([row('Plank', [set()], { exerciseType: 'Sets of Duration' })]).detail,
  'Plank',
);

const done = present([row('Bench', [set({ completed: true })])]);
assert.equal(done.detail, null);
assert.deepEqual(done.actions, ['finishWorkout', 'uncompleteSet']);

const empty = present([row('', [set()])]);
assert.equal(empty.detail, null);
assert.deepEqual(empty.actions, []);
assert.deepEqual(empty.segments, []);

console.log('workout-notification-model: ok');
