import { ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import { DraftExerciseRow, DraftSet, ExerciseType, PerformedExercise, Workout } from '@/types/workout';
import { cascadeSetField, collapseSetsToDraft, linkedToNext, makeUid } from '@/lib/workout-conversion';
import { useMemo, useState } from 'react';
import { reorderItems } from 'react-native-reorderable-list';

// Shared editing engine for both the plan/log editor (app/modal.tsx) and the live
// active-workout screen (app/active-workout.tsx). Holds the DraftExerciseRow[] state and
// every set/exercise mutator that is identical between the two.
//
// trackCompletion gates the per-set `completed` field: active workouts track which sets
// are done, mirrored into the session snapshot (src/lib/active-workout-session.ts) so a
// killed workout resumes with checkmarks intact, while the plan/log editor must NOT write
// a `completed` key — expandDraftToSets only persists it when defined, so omitting it here
// keeps logged/planned docs clean.
// Exercise selection also lives here so every editor uses the planning behavior: prefer
// the latest matching exercise from the same workout day, then fall back to any day.
// The forward-cascade rule for set edits lives in src/lib/workout-conversion.ts.

type DraftExerciseOptions = {
  trackCompletion?: boolean;
  workoutHistory?: Workout[];
  workoutName?: string;
  // Repeat one representative set instead of copying history verbatim; see
  // normalizeDraftSets in src/lib/workout-conversion.ts.
  normalize?: boolean;
};

function findLastPerformed(
  workoutHistory: Workout[],
  workoutName: string,
  selection: ExercisePickerSelection
): PerformedExercise | null {
  const search = (predicate: (workout: Workout) => boolean): PerformedExercise | null => {
    for (const workout of workoutHistory) {
      if (!predicate(workout)) continue;
      const match = (workout.performedExercises ?? []).find(
        (exercise) =>
          exercise.exerciseId === selection.exerciseId &&
          exercise.variationId === selection.variationId
      );
      if (match) return match;
    }
    return null;
  };

  return search((workout) => workout.name === workoutName) ?? search(() => true);
}

export function useDraftExercises(opts?: DraftExerciseOptions) {
  const trackCompletion = opts?.trackCompletion ?? false;
  const workoutHistory = opts?.workoutHistory ?? [];
  const workoutName = opts?.workoutName ?? '';
  const normalize = opts?.normalize ?? false;

  const blankSet = useMemo(
    () => (): DraftSet => ({
      reps: 10,
      weight: '',
      durationMinutes: 0,
      durationSeconds: 30,
      ...(trackCompletion ? { completed: false } : {}),
    }),
    [trackCompletion]
  );

  const blankRow = useMemo(
    () => (): DraftExerciseRow => ({
      uid: makeUid(),
      exerciseId: null,
      variationId: null,
      label: '',
      exerciseType: 'Sets of Reps',
      bodyweight: false,
      sets: [blankSet()],
    }),
    [blankSet]
  );

  // No row exists until an exercise is picked, so a row with a null exercise never renders.
  const [exercises, setExercises] = useState<DraftExerciseRow[]>([]);

  // Fill `row` with the picked exercise; sets come from the latest matching history when
  // there is one, otherwise the row keeps its own.
  const applySelection = (row: DraftExerciseRow, selection: ExercisePickerSelection): DraftExerciseRow => {
    const lastPerformed = findLastPerformed(workoutHistory, workoutName, selection);
    const identity = {
      exerciseId: selection.exerciseId,
      variationId: selection.variationId,
      label: selection.label,
      // Superset membership belongs to this workout's layout, not the history row.
      supersetId: row.supersetId,
    };
    if (!lastPerformed) return { ...row, ...identity };

    const selected = { ...collapseSetsToDraft(lastPerformed, normalize), ...identity };
    if (!trackCompletion) return selected;
    return { ...selected, sets: selected.sets.map((set) => ({ ...set, completed: false })) };
  };

  const addExercise = (selection: ExercisePickerSelection) =>
    setExercises((prev) => [...prev, applySelection(blankRow(), selection)]);

  const selectExercise = (i: number, selection: ExercisePickerSelection) =>
    setExercises((prev) => prev.map((exercise, idx) => (idx === i ? applySelection(exercise, selection) : exercise)));

  const toggleBodyweight = (i: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, bodyweight: !ex.bodyweight, sets: ex.sets.map((s) => ({ ...s, weight: '' })) } : ex
      )
    );

  const removeExercise = (i: number) => setExercises((prev) => prev.filter((_, idx) => idx !== i));

  const updateExerciseField = (i: number, field: 'exerciseType', value: ExerciseType) =>
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));

  const updateSet = (i: number, setIdx: number, field: 'weight' | 'durationMinutes' | 'durationSeconds', value: string) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        if (field === 'weight') return { ...ex, sets: cascadeSetField(ex.sets, setIdx, 'weight', value) };
        const n = Number(value) || 0;
        return { ...ex, sets: cascadeSetField(ex.sets, setIdx, field, field === 'durationSeconds' ? Math.min(59, n) : n) };
      })
    );

  const bumpReps = (i: number, setIdx: number, delta: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return { ...ex, sets: cascadeSetField(ex.sets, setIdx, 'reps', Math.max(0, ex.sets[setIdx].reps + delta)) };
      })
    );

  const incrementSet = (i: number, setIdx: number) => bumpReps(i, setIdx, 1);

  const decrementSet = (i: number, setIdx: number) => bumpReps(i, setIdx, -1);

  const addSet = (i: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        const last = ex.sets[ex.sets.length - 1] ?? blankSet();
        return { ...ex, sets: [...ex.sets, { ...last, ...(trackCompletion ? { completed: false } : {}) }] };
      })
    );

  const removeSet = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i || ex.sets.length <= 1) return ex;
        return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
      })
    );

  const toggleSetComplete = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return { ...ex, sets: ex.sets.map((s, si) => (si === setIdx ? { ...s, completed: !s.completed } : s)) };
      })
    );

  // Links row i to row i+1, merging both rows' supersets; if they are already linked,
  // splits the superset between them by giving everything after i a fresh id. Always a
  // fresh id: reusing an existing one could silently link a stale neighbour carrying it.
  const toggleSuperset = (i: number) =>
    setExercises((prev) => {
      if (i < 0 || i >= prev.length - 1) return prev;
      const runEnd = (from: number) => {
        let end = from;
        while (linkedToNext(prev, end)) end++;
        return end;
      };
      if (linkedToNext(prev, i)) {
        const id = makeUid();
        const end = runEnd(i);
        return prev.map((ex, idx) => (idx > i && idx <= end ? { ...ex, supersetId: id } : ex));
      }
      let start = i;
      while (start > 0 && linkedToNext(prev, start - 1)) start--;
      const end = runEnd(i + 1);
      const id = makeUid();
      return prev.map((ex, idx) => (idx >= start && idx <= end ? { ...ex, supersetId: id } : ex));
    });

  const reorder = (from: number, to: number) => setExercises((prev) => reorderItems(prev, from, to));

  return {
    exercises,
    setExercises,
    addExercise,
    selectExercise,
    toggleBodyweight,
    removeExercise,
    updateExerciseField,
    updateSet,
    incrementSet,
    decrementSet,
    addSet,
    removeSet,
    toggleSetComplete,
    toggleSuperset,
    reorder,
  };
}
