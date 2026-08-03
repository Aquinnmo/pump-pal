import { DraftExerciseRow, DraftSet } from '@/types/workout';
import { cascadeSetField } from '@/utils/workout-conversion';

// What the Wear OS watch shows, and what it can ask the phone to do. The phone is
// the only Firestore writer; the watch renders this payload and posts actions back.
// Kept free of Firestore/React Native imports so the active-workout screen, the
// headless action task and the node test all share one definition of "next set".

export type WearIdle = {
  label: string;
  name: string;
  action: string;
};

export type WearActive = {
  workoutId: string;
  workoutName: string;
  exercise: string;
  // Position of the next set within its own exercise, 1-based.
  setNumber: number;
  setsInExercise: number;
  reps: number;
  weight: number;
  bodyweight: boolean;
  // Non-null marks a duration set: the watch hides reps/weight and disables the dial.
  durationSeconds: number | null;
  completedSets: number;
  totalSets: number;
};

export type WearState = {
  // Millisecond timestamp. The watch treats a newer ts as the ack for an action it
  // sent, and the Data Layer would otherwise drop a byte-identical DataItem.
  ts: number;
  // empty = a live workout with no exercises yet (they get added on the phone).
  // done = every set is completed, so the only thing left is finishing.
  mode: 'idle' | 'active' | 'empty' | 'done';
  idle?: WearIdle;
  active?: WearActive;
};

export type WearAction =
  | { action: 'startWorkout' }
  | { action: 'completeSet'; workoutId: string; reps?: number; weight?: number }
  | { action: 'uncompleteSet'; workoutId: string }
  | { action: 'finishWorkout'; workoutId: string };

// Takes the same copy the Home card and the home-screen widget show, so all three
// surfaces word "Up next" identically. Drops describeUpNext's `source` field, which
// only the phone card renders.
export function buildWearIdleState(copy: WearIdle, ts = Date.now()): WearState {
  return { ts, mode: 'idle', idle: { label: copy.label, name: copy.name, action: copy.action } };
}

export type FlatSet = { rowIndex: number; setIndex: number; set: DraftSet };

// Only rows the user has actually picked an exercise for count — a blank trailing
// row is an editing affordance on the phone, not a set to do.
export function flattenSets(rows: DraftExerciseRow[]): FlatSet[] {
  const flat: FlatSet[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.label.trim() === '') return;
    row.sets.forEach((set, setIndex) => flat.push({ rowIndex, setIndex, set }));
  });
  return flat;
}

// The set after the last completed one, in workout order — NOT the first incomplete
// one. Completing set 3 while 1 and 2 are unticked deliberately moves you to set 4,
// matching how the phone's live notification has always picked "current exercise".
// Returns -1 when nothing is left.
export function nextSetIndex(flat: { completed?: boolean }[]): number {
  let lastCompleted = -1;
  flat.forEach((s, i) => {
    if (s.completed) lastCompleted = i;
  });
  const next = lastCompleted + 1;
  return next < flat.length ? next : -1;
}

export function buildWearActiveState(
  workoutId: string,
  workoutName: string,
  rows: DraftExerciseRow[],
  ts = Date.now()
): WearState {
  const flat = flattenSets(rows);
  if (flat.length === 0) return { ts, mode: 'empty' };

  const completedSets = flat.filter((f) => f.set.completed).length;
  const identity = { workoutId, workoutName, completedSets, totalSets: flat.length };
  const nextIdx = nextSetIndex(flat.map((f) => f.set));

  // Nothing left to do. The payload still carries the workout id, because the watch's
  // Finish button needs something to act on.
  if (nextIdx === -1) {
    return {
      ts,
      mode: 'done',
      active: {
        ...identity,
        exercise: '',
        setNumber: 0,
        setsInExercise: 0,
        reps: 0,
        weight: 0,
        bodyweight: false,
        durationSeconds: null,
      },
    };
  }

  const { rowIndex, setIndex, set } = flat[nextIdx];
  const row = rows[rowIndex];
  const duration = row.exerciseType === 'Sets of Duration';

  return {
    ts,
    mode: 'active',
    active: {
      ...identity,
      exercise: row.label,
      setNumber: setIndex + 1,
      setsInExercise: row.sets.length,
      reps: duration ? 0 : set.reps,
      weight: duration || row.bodyweight ? 0 : Number(set.weight) || 0,
      bodyweight: row.bodyweight,
      durationSeconds: duration ? (Number(set.durationMinutes) || 0) * 60 + (Number(set.durationSeconds) || 0) : null,
    },
  };
}

function mapRow(rows: DraftExerciseRow[], rowIndex: number, fn: (sets: DraftSet[]) => DraftSet[]): DraftExerciseRow[] {
  return rows.map((row, i) => (i === rowIndex ? { ...row, sets: fn(row.sets) } : row));
}

// Applies a watch action to the phone's draft rows. Pure, so the live screen and the
// headless task get identical results. Weight/reps overrides go through
// cascadeSetField, so adjusting the dial on the watch carries forward to the
// remaining sets exactly as editing on the phone would.
export function applyWearAction(rows: DraftExerciseRow[], action: WearAction): DraftExerciseRow[] {
  const flat = flattenSets(rows);

  if (action.action === 'completeSet') {
    const nextIdx = nextSetIndex(flat.map((f) => f.set));
    if (nextIdx === -1) return rows;
    const { rowIndex, setIndex } = flat[nextIdx];
    const row = rows[rowIndex];
    const duration = row.exerciseType === 'Sets of Duration';

    let next = rows;
    if (!duration && action.reps !== undefined) {
      next = mapRow(next, rowIndex, (sets) => cascadeSetField(sets, setIndex, 'reps', Math.max(0, Math.round(action.reps!))));
    }
    if (!duration && !row.bodyweight && action.weight !== undefined) {
      next = mapRow(next, rowIndex, (sets) => cascadeSetField(sets, setIndex, 'weight', String(action.weight)));
    }
    return mapRow(next, rowIndex, (sets) => sets.map((s, si) => (si === setIndex ? { ...s, completed: true } : s)));
  }

  if (action.action === 'uncompleteSet') {
    let lastCompleted = -1;
    flat.forEach((f, i) => {
      if (f.set.completed) lastCompleted = i;
    });
    if (lastCompleted === -1) return rows;
    const { rowIndex, setIndex } = flat[lastCompleted];
    return mapRow(rows, rowIndex, (sets) => sets.map((s, si) => (si === setIndex ? { ...s, completed: false } : s)));
  }

  return rows;
}
