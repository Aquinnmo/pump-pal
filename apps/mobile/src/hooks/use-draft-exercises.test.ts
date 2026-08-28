import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import { makeDraftExerciseRow, makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { DraftExerciseRow, DraftSet, ExerciseRef, PerformedExercise, PerformedSet } from '@/types/workout';
import { useDraftExercises } from './use-draft-exercises';

const selection = (overrides: Partial<ExerciseRef> = {}): ExerciseRef => ({
  exerciseId: 'bench-press',
  variationId: null,
  label: 'Bench Press',
  ...overrides,
});

const draftSet = (overrides: Partial<DraftSet> = {}): DraftSet => ({
  reps: 10,
  weight: '20',
  durationMinutes: 0,
  durationSeconds: 30,
  ...overrides,
});

function historyWorkout(
  name: string,
  sets: PerformedSet[],
  overrides: Partial<PerformedExercise> = {},
): ReturnType<typeof makeWorkout> {
  return makeWorkout({ name, performedExercises: [makePerformedExercise({ sets, ...overrides })] });
}

function withDraft(
  options: Parameters<typeof useDraftExercises>[0],
  fn: (result: { current: ReturnType<typeof useDraftExercises> }) => void,
): void {
  const rendered = renderHook(() => useDraftExercises(options));
  try {
    fn(rendered.result);
  } finally {
    rendered.unmount();
  }
}

// The plan/log editor does not track completion: even its blank set has no
// completed property at all.
withDraft({ trackCompletion: false }, (result) => {
  assert.equal('completed' in result.current.exercises[0]!.sets[0]!, false);
});

withDraft({
  trackCompletion: false,
  workoutName: 'Push Day',
  workoutHistory: [historyWorkout('Push Day', [{ setNumber: 1, reps: 8, weight: 40, completed: true }])],
}, (result) => {
  act(() => result.current.selectExercise(0, selection()));
  // BUG: collapseSetsToDraft carries the history's completed field through
  // this trackCompletion=false path; planned/logged drafts should omit it.
  assert.equal(
    'completed' in result.current.exercises[0]!.sets[0]!,
    true,
    'known bug: history autofill currently preserves completed',
  );
});

// Same-name history wins over a different-name match, even when it appears
// later in the supplied history. Matching also includes null variation ids.
withDraft({
  trackCompletion: true,
  workoutName: 'Push Day',
  workoutHistory: [
    historyWorkout('Pull Day', [{ setNumber: 1, reps: 5, weight: 40, completed: true }]),
    historyWorkout('Push Day', [{ setNumber: 1, reps: 7, weight: 50, completed: true }], { variationId: 'incline' }),
    historyWorkout('Push Day', [{ setNumber: 1, reps: 9, weight: 60, completed: true }]),
  ],
}, (result) => {
  act(() => result.current.selectExercise(0, selection()));
  const row = result.current.exercises[0]!;
  assert.equal(row.exerciseId, 'bench-press');
  assert.equal(row.variationId, null);
  assert.equal(row.label, 'Bench Press');
  assert.equal(row.sets[0]!.reps, 9, 'same-name null-variation match beats other names and variations');
  assert.equal(row.sets[0]!.weight, '60');
  assert.equal(row.sets[0]!.completed, false, 'autofilled sets reset completion');
});

// findLastPerformed returns the first matching history row, so callers must
// supply history newest-first for the first row to be the most recent.
withDraft({
  trackCompletion: true,
  workoutName: 'Push Day',
  workoutHistory: [
    historyWorkout('Push Day', [{ setNumber: 1, reps: 12, weight: 70, completed: true }]),
    historyWorkout('Push Day', [{ setNumber: 1, reps: 8, weight: 40, completed: true }]),
  ],
}, (result) => {
  act(() => result.current.selectExercise(0, selection()));
  assert.equal(result.current.exercises[0]!.sets[0]!.reps, 12);
});

// A selection with no history match swaps only identity fields and preserves
// the existing row's sets and editing fields.
withDraft({ workoutHistory: [historyWorkout('Other', [{ setNumber: 1, reps: 5, weight: 30 }])] }, (result) => {
  const existing = makeDraftExerciseRow({
    exerciseId: 'old-exercise',
    variationId: 'old-variation',
    label: 'Old Exercise',
    bodyweight: true,
    sets: [draftSet({ reps: 4, weight: '' })],
  });
  act(() => result.current.setExercises([existing]));
  act(() => result.current.selectExercise(0, selection({ variationId: 'new-variation', label: 'New Exercise' })));
  const row = result.current.exercises[0]!;
  assert.deepEqual(row.sets, existing.sets);
  assert.equal(row.exerciseId, 'bench-press');
  assert.equal(row.variationId, 'new-variation');
  assert.equal(row.label, 'New Exercise');
  assert.equal(row.bodyweight, true);
});

// Mutators are index-based: the second row changes while the first remains
// untouched, and adding/removing rows uses the requested indices.
withDraft({}, (result) => {
  act(() => result.current.addExercise());
  assert.equal(result.current.exercises.length, 2);
  act(() => result.current.updateExerciseField(1, 'exerciseType', 'Sets of Duration'));
  assert.equal(result.current.exercises[0]!.exerciseType, 'Sets of Reps');
  assert.equal(result.current.exercises[1]!.exerciseType, 'Sets of Duration');
  act(() => result.current.removeExercise(0));
  assert.equal(result.current.exercises.length, 1);
  assert.equal(result.current.exercises[0]!.exerciseType, 'Sets of Duration');
});

// Bodyweight clears every set's weight, not only the set at the active index.
withDraft({}, (result) => {
  const rows: DraftExerciseRow[] = [makeDraftExerciseRow({ sets: [draftSet({ weight: '20' }), draftSet({ weight: '30' })] })];
  act(() => result.current.setExercises(rows));
  act(() => result.current.toggleBodyweight(0));
  assert.equal(result.current.exercises[0]!.bodyweight, true);
  assert.deepEqual(result.current.exercises[0]!.sets.map((set) => set.weight), ['', '']);
});

// A single set cannot be removed. Adding a set clones the last set's values
// but resets its completion marker for tracked workouts.
withDraft({ trackCompletion: true }, (result) => {
  act(() => result.current.setExercises([makeDraftExerciseRow({ sets: [draftSet({ completed: true })] })]));
  act(() => result.current.removeSet(0, 0));
  assert.equal(result.current.exercises[0]!.sets.length, 1);
  act(() => result.current.addSet(0));
  assert.equal(result.current.exercises[0]!.sets.length, 2);
  assert.equal(result.current.exercises[0]!.sets[1]!.reps, 10);
  assert.equal(result.current.exercises[0]!.sets[1]!.weight, '20');
  assert.equal(result.current.exercises[0]!.sets[1]!.completed, false);
});

// Set updates cascade while values match; duration seconds clamp at 59,
// invalid/empty numeric input becomes zero, and weight remains a raw string.
withDraft({}, (result) => {
  act(() => result.current.setExercises([makeDraftExerciseRow({ sets: [draftSet(), draftSet()] })]));
  act(() => result.current.updateSet(0, 0, 'durationSeconds', '99'));
  assert.deepEqual(result.current.exercises[0]!.sets.map((set) => set.durationSeconds), [59, 59]);
  act(() => result.current.updateSet(0, 0, 'durationMinutes', ''));
  assert.deepEqual(result.current.exercises[0]!.sets.map((set) => set.durationMinutes), [0, 0]);
  act(() => result.current.updateSet(0, 0, 'durationSeconds', 'abc'));
  assert.deepEqual(result.current.exercises[0]!.sets.map((set) => set.durationSeconds), [0, 0]);
  act(() => result.current.updateSet(0, 0, 'weight', '12.5kg'));
  assert.equal(result.current.exercises[0]!.sets[0]!.weight, '12.5kg');
});

// Completion toggles the requested set, and rep bumps never go below zero.
withDraft({ trackCompletion: true }, (result) => {
  act(() => result.current.setExercises([makeDraftExerciseRow({ sets: [draftSet({ reps: 1, completed: false })] })]));
  act(() => result.current.toggleSetComplete(0, 0));
  assert.equal(result.current.exercises[0]!.sets[0]!.completed, true);
  act(() => result.current.decrementSet(0, 0));
  assert.equal(result.current.exercises[0]!.sets[0]!.reps, 0);
  act(() => result.current.decrementSet(0, 0));
  assert.equal(result.current.exercises[0]!.sets[0]!.reps, 0, 'decrement floors at zero');
  act(() => result.current.incrementSet(0, 0));
  assert.equal(result.current.exercises[0]!.sets[0]!.reps, 1);
});

console.log('use-draft-exercises: all assertions passed');
