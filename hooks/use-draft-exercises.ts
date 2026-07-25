import { ExercisePickerSelection } from '@/components/ui/exercise-picker';
import { DraftExerciseRow, DraftSet, ExerciseType } from '@/types/workout';
import { makeUid } from '@/utils/workout-conversion';
import { useMemo, useState } from 'react';
import { reorderItems } from 'react-native-reorderable-list';

// Shared editing engine for both the plan/log editor (app/modal.tsx) and the live
// active-workout screen (app/active-workout.tsx). Holds the DraftExerciseRow[] state and
// every set/exercise mutator that is identical between the two.
//
// trackCompletion gates the per-set `completed` field: active workouts track which sets
// are done (and persist it so a killed workout resumes with checkmarks intact), while the
// plan/log editor must NOT write a `completed` key — expandDraftToSets only persists it
// when defined, so omitting it here keeps logged/planned docs clean.
// An edit to a set cascades forward: the new value overwrites each following set that
// still held the old value, stopping at the first set the user deliberately made
// different so pyramids / drop sets survive. Completed sets are a record of what was
// actually lifted — they are skipped, not overwritten, and do not stop the run.
function cascadeSetField<K extends keyof DraftSet>(
  sets: DraftSet[],
  from: number,
  field: K,
  value: DraftSet[K]
): DraftSet[] {
  const previous = sets[from][field];
  const next = sets.slice();
  next[from] = { ...next[from], [field]: value };
  for (let si = from + 1; si < next.length; si++) {
    if (next[si].completed) continue;
    if (next[si][field] !== previous) break;
    next[si] = { ...next[si], [field]: value };
  }
  return next;
}

export function useDraftExercises(opts?: { trackCompletion?: boolean }) {
  const trackCompletion = opts?.trackCompletion ?? false;

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

  const [exercises, setExercises] = useState<DraftExerciseRow[]>(() => [blankRow()]);

  const addExercise = () => setExercises((prev) => [...prev, blankRow()]);

  const selectExercise = (i: number, selection: ExercisePickerSelection) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, exerciseId: selection.exerciseId, variationId: selection.variationId, label: selection.label } : ex
      )
    );

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

  const reorder = (from: number, to: number) => setExercises((prev) => reorderItems(prev, from, to));

  return {
    exercises,
    setExercises,
    blankRow,
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
    reorder,
  };
}
