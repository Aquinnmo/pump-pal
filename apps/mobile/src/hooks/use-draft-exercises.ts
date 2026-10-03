import { ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import { SET_TYPES, setTypeOf } from '@/constants/set-types';
import { DraftExerciseRow, DraftPartTarget, DraftSet, DraftSubSet, ExerciseType, PerformedExercise, Workout } from '@/types/workout';
import {
  cascadeSetField,
  collapseSetsToDraft,
  ensureDraftRowIds,
  linkedToNext,
  makeUid,
  nextSubSet,
  setParts,
  stageOf,
  withStage,
} from '@/lib/workout-conversion';
import { SetStateAction, useCallback, useMemo, useState } from 'react';
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
  const [exercises, setDraftExercises] = useState<DraftExerciseRow[]>([]);
  const setExercises = useCallback((value: SetStateAction<DraftExerciseRow[]>) =>
    setDraftExercises((prev) => ensureDraftRowIds(typeof value === 'function' ? value(prev) : value)), []);

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

  // Applies fn to row i's sets; every set/part mutator below goes through it.
  const mapSets = (i: number, fn: (sets: DraftSet[]) => DraftSet[]) =>
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, sets: fn(ex.sets) } : ex)));

  const mapSet = (i: number, setIdx: number, fn: (set: DraftSet) => DraftSet) =>
    mapSets(i, (sets) => sets.map((s, si) => (si === setIdx ? fn(s) : s)));

  // `stage` picks the part of a drop set (0 = the set itself); see stageOf.
  const updateSet = (i: number, setIdx: number, field: 'weight' | 'durationMinutes' | 'durationSeconds', value: string, stage = 0) =>
    mapSets(i, (sets) => {
      if (field === 'weight') return cascadeSetField(sets, setIdx, 'weight', value, stage);
      const n = Number(value) || 0;
      return cascadeSetField(sets, setIdx, field, field === 'durationSeconds' ? Math.min(59, n) : n, stage);
    });

  const bumpReps = (i: number, setIdx: number, delta: number, stage: number) =>
    mapSets(i, (sets) =>
      cascadeSetField(sets, setIdx, 'reps', Math.max(0, stageOf(sets[setIdx], stage).reps + delta), stage)
    );

  const incrementSet = (i: number, setIdx: number, stage = 0) => bumpReps(i, setIdx, 1, stage);

  const decrementSet = (i: number, setIdx: number, stage = 0) => bumpReps(i, setIdx, -1, stage);

  // A part as it starts life in this editor: not done, when completion is tracked.
  const fresh = <T extends DraftSubSet>(part: T): T => ({ ...part, uid: makeUid(), ...(trackCompletion ? { completed: false } : {}) });

  // Copies the whole last set, drops included, so drop set after drop set is one tap.
  const addSet = (i: number) =>
    mapSets(i, (sets) => {
      const last = sets[sets.length - 1] ?? blankSet();
      return [...sets, { ...fresh(last), ...(last.subSets ? { subSets: last.subSets.map(fresh) } : {}) }];
    });

  const removeSet = (i: number, setIdx: number) =>
    mapSets(i, (sets) => (sets.length <= 1 ? sets : sets.filter((_, si) => si !== setIdx)));

  const toggleSetComplete = (i: number, setIdx: number, stage = 0) =>
    mapSet(i, setIdx, (s) => withStage(s, stage, { completed: !stageOf(s, stage).completed }));

  // Simple is stored as no type at all, so untyped sets stay byte-identical to before.
  // A type with parts gets its first extra part straight away, so picking "Drop set"
  // visibly makes one — on any set, the first included.
  const setSetType = (i: number, setIdx: number, type: string) =>
    mapSet(i, setIdx, (s) => {
      const def = SET_TYPES.find((t) => t.id === type) ?? setTypeOf(undefined);
      const base = { ...s, type: def.id === 'normal' ? undefined : def.id, subSets: undefined };
      if (!def.subSet) return base;
      return { ...base, subSets: s.subSets?.length ? s.subSets : [fresh(nextSubSet(def, s))] };
    });

  const addSubSet = (i: number, setIdx: number) =>
    mapSet(i, setIdx, (s) => {
      const parts = setParts(s);
      return { ...s, subSets: [...(s.subSets ?? []), fresh(nextSubSet(setTypeOf(s), parts[parts.length - 1]))] };
    });

  // Removing the last extra part leaves nothing to drop to, so the set goes back to simple.
  const removeSubSet = (i: number, setIdx: number, stage: number) =>
    mapSet(i, setIdx, (s) => {
      const subSets = (s.subSets ?? []).filter((_, k) => k !== stage - 1);
      return subSets.length > 0 ? { ...s, subSets } : { ...s, type: undefined, subSets: undefined };
    });

  // Swipe/menu targets survive row reordering and earlier deletions. Resolve
  // inside the updater, never from a render's captured indices.
  const changePart = (target: DraftPartTarget, change: (sets: DraftSet[], si: number, stage: number) => DraftSet[]) =>
    setExercises((prev) => {
      const i = prev.findIndex((row) => row.uid === target.exerciseUid);
      if (i < 0) return prev;
      const sets = prev[i].sets;
      const si = sets.findIndex((set) => set.uid === target.setUid);
      if (si < 0) return prev;
      const stage = setParts(sets[si]).findIndex((part) => part.uid === target.partUid);
      if (stage < 0) return prev;
      const next = change(sets, si, stage);
      return next === sets ? prev : prev.map((row, idx) => idx === i ? { ...row, sets: next } : row);
    });

  const removePart = (target: DraftPartTarget) => changePart(target, (sets, si, stage) => {
    if (stage === 0) return sets.length <= 1 ? sets : sets.filter((_, index) => index !== si);
    const subSets = sets[si].subSets!.filter((_, index) => index !== stage - 1);
    return sets.map((set, index) => index !== si ? set : subSets.length
      ? { ...set, subSets }
      : { ...set, type: undefined, subSets: undefined });
  });

  const togglePartComplete = (target: DraftPartTarget) => changePart(target, (sets, si, stage) =>
    sets.map((set, index) => index !== si ? set : withStage(set, stage, { completed: !stageOf(set, stage).completed })));

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
    setSetType,
    addSubSet,
    removeSubSet,
    removePart,
    togglePartComplete,
    reorder,
  };
}
