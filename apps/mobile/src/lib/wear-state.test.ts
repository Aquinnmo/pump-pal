import { DraftExerciseRow, DraftSet } from '@/types/workout';
import { applyWearAction, buildWearActiveState, nextSetIndex } from '@/lib/wear-state';
import assert from 'node:assert/strict';

const set = (over: Partial<DraftSet> = {}): DraftSet => ({
  reps: 10,
  weight: '100',
  durationMinutes: 0,
  durationSeconds: 30,
  completed: false,
  ...over,
});

const row = (label: string, sets: DraftSet[], over: Partial<DraftExerciseRow> = {}): DraftExerciseRow => ({
  uid: `uid_${label}`,
  exerciseId: 'ex1',
  variationId: null,
  label,
  exerciseType: 'Sets of Reps',
  bodyweight: false,
  sets,
  ...over,
});

// --- nextSetIndex ---
assert.equal(nextSetIndex([]), -1);
assert.equal(nextSetIndex([{ completed: false }, { completed: false }]), 0);
assert.equal(nextSetIndex([{ completed: true }, { completed: false }]), 1);
assert.equal(nextSetIndex([{ completed: true }, { completed: true }]), -1);
// Out-of-order completion: the set AFTER the last completed one, not the first gap.
assert.equal(nextSetIndex([{ completed: false }, { completed: true }, { completed: false }]), 2);

// --- buildWearActiveState modes ---
assert.equal(buildWearActiveState('w1', 'Push', []).mode, 'empty');
// A blank trailing row is an editing affordance, not a set to do.
assert.equal(buildWearActiveState('w1', 'Push', [row('', [set()])]).mode, 'empty');
// Done still carries the workout id and counts — the watch's Finish button needs them.
const finished = buildWearActiveState('w1', 'Push', [row('Bench', [set({ completed: true })])]);
assert.equal(finished.mode, 'done');
assert.equal(finished.active!.workoutId, 'w1');
assert.deepEqual([finished.active!.completedSets, finished.active!.totalSets], [1, 1]);

const twoExercises = [
  row('Bench', [set({ completed: true }), set(), set()]),
  row('Fly', [set({ reps: 12, weight: '40' })]),
];
const active = buildWearActiveState('w1', 'Push', twoExercises, 123).active!;
assert.equal(buildWearActiveState('w1', 'Push', twoExercises, 123).ts, 123);
assert.deepEqual(
  { ...active },
  {
    workoutId: 'w1',
    workoutName: 'Push',
    exercise: 'Bench',
    setNumber: 2,
    setsInExercise: 3,
    reps: 10,
    weight: 100,
    bodyweight: false,
    durationSeconds: null,
    completedSets: 1,
    totalSets: 4,
  }
);

// Bodyweight reports weight 0; duration sets report their total seconds.
assert.equal(buildWearActiveState('w1', 'Push', [row('Pullup', [set({ weight: '' })], { bodyweight: true })]).active!.weight, 0);
assert.equal(
  buildWearActiveState('w1', 'Core', [
    row('Plank', [set({ durationMinutes: 1, durationSeconds: 30 })], { exerciseType: 'Sets of Duration' }),
  ]).active!.durationSeconds,
  90
);

// --- completeSet ---
const done = applyWearAction([row('Bench', [set(), set(), set()])], { action: 'completeSet', workoutId: 'w1' });
assert.deepEqual(
  done[0].sets.map((s) => s.completed),
  [true, false, false]
);

// A dial-adjusted weight cascades forward to the sets that still held the old value.
const bumped = applyWearAction([row('Bench', [set(), set(), set({ weight: '135' })])], {
  action: 'completeSet',
  workoutId: 'w1',
  weight: 110,
  reps: 8,
});
// Cascade is per field: set 3's weight was deliberately changed so it keeps 135,
// but its reps still matched, so the new rep count carries all the way through.
assert.deepEqual(
  bumped[0].sets.map((s) => `${s.reps}@${s.weight}`),
  ['8@110', '8@110', '8@135']
);
assert.equal(bumped[0].sets[0].completed, true);

// Already-completed sets are a record of what was lifted: never overwritten, and
// they do not stop the cascade.
const past = applyWearAction([row('Bench', [set({ completed: true }), set(), set()])], {
  action: 'completeSet',
  workoutId: 'w1',
  weight: 120,
});
assert.deepEqual(
  past[0].sets.map((s) => s.weight),
  ['100', '120', '120']
);

// Bodyweight and duration exercises ignore weight/reps overrides.
const bw = applyWearAction([row('Pullup', [set({ weight: '' })], { bodyweight: true })], {
  action: 'completeSet',
  workoutId: 'w1',
  weight: 45,
});
assert.equal(bw[0].sets[0].weight, '');

// Nothing left to complete is a no-op, not a crash.
const allDone = [row('Bench', [set({ completed: true })])];
assert.deepEqual(applyWearAction(allDone, { action: 'completeSet', workoutId: 'w1' }), allDone);

// --- uncompleteSet ---
// Clears the LAST completed set, crossing an exercise boundary when it has to.
const undone = applyWearAction(
  [row('Bench', [set({ completed: true }), set({ completed: true })]), row('Fly', [set({ completed: true }), set()])],
  { action: 'uncompleteSet', workoutId: 'w1' }
);
assert.deepEqual(
  undone.map((r) => r.sets.map((s) => s.completed)),
  [[true, true], [false, false]]
);

// Round trip: complete then uncomplete returns to the starting state.
const start = [row('Bench', [set(), set()])];
assert.deepEqual(
  applyWearAction(applyWearAction(start, { action: 'completeSet', workoutId: 'w1' }), {
    action: 'uncompleteSet',
    workoutId: 'w1',
  }),
  start
);

// Nothing completed yet: no-op.
assert.deepEqual(applyWearAction(start, { action: 'uncompleteSet', workoutId: 'w1' }), start);

// Actions the phone handles elsewhere leave the rows alone.
assert.deepEqual(applyWearAction(start, { action: 'startWorkout' }), start);
assert.deepEqual(applyWearAction(start, { action: 'finishWorkout', workoutId: 'w1' }), start);

console.log('wear-state: ok');
