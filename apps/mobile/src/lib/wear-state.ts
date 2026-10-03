import { DraftExerciseRow, DraftSet, DraftSubSet } from '@/types/workout';
import { cascadeSetField, linkedToNext, setParts, stageLabel, withStage } from '@/lib/workout-conversion';

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
  // Set-type label ("Drop set") for a non-normal set, else null. Older watch builds
  // read the payload with org.json opt*, so they simply ignore it.
  setLabel: string | null;
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

// One entry per part the user ticks off: a simple set is one entry, a drop set is
// one per drop (stage 0 = the set itself). `set` holds that part's numbers.
export type FlatSet = { rowIndex: number; setIndex: number; stage: number; set: DraftSubSet };

// Only rows the user has actually picked an exercise for count — a blank trailing
// row is an editing affordance on the phone, not a set to do. A superset (a run of
// linked rows) is walked round-robin by set — A1, B1, A2, B2 — with uneven rows simply
// dropping out once exhausted; an unlinked row is a run of one, so plain order holds.
// A drop set's parts are emitted together, so its drops stay with it: A1, A1 drop, B1.
export function flattenSets(rows: DraftExerciseRow[]): FlatSet[] {
  const flat: FlatSet[] = [];
  for (let start = 0; start < rows.length; ) {
    let end = start + 1;
    while (end < rows.length && linkedToNext(rows, end - 1)) end++;
    const run: number[] = [];
    for (let r = start; r < end; r++) if (rows[r].label.trim() !== '') run.push(r);
    const rounds = Math.max(0, ...run.map((r) => rows[r].sets.length));
    for (let setIndex = 0; setIndex < rounds; setIndex++) {
      for (const rowIndex of run) {
        const draftSet = rows[rowIndex].sets[setIndex];
        if (!draftSet) continue;
        setParts(draftSet).forEach((set, stage) => flat.push({ rowIndex, setIndex, stage, set }));
      }
    }
    start = end;
  }
  return flat;
}

// Sets, not parts: a drop set's drops are ticked one by one, but it is one set and
// counts as done only once every part is. What every surface shows as "x/y sets".
export function setProgress(flat: FlatSet[]): { completedSets: number; totalSets: number } {
  const done: boolean[] = [];
  for (const f of flat) {
    if (f.stage === 0) done.push(true);
    if (!f.set.completed) done[done.length - 1] = false;
  }
  return { completedSets: done.filter(Boolean).length, totalSets: done.length };
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

  const identity = { workoutId, workoutName, ...setProgress(flat) };
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
        setLabel: null,
      },
    };
  }

  const { rowIndex, setIndex, stage, set } = flat[nextIdx];
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
      setLabel: stageLabel(row.sets[setIndex], stage),
    },
  };
}

function markStage(sets: DraftSet[], setIndex: number, stage: number, completed: boolean): DraftSet[] {
  return sets.map((s, si) => (si === setIndex ? withStage(s, stage, { completed }) : s));
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
    const { rowIndex, setIndex, stage } = flat[nextIdx];
    const row = rows[rowIndex];
    const duration = row.exerciseType === 'Sets of Duration';

    let next = rows;
    if (!duration && action.reps !== undefined) {
      next = mapRow(next, rowIndex, (sets) => cascadeSetField(sets, setIndex, 'reps', Math.max(0, Math.round(action.reps!)), stage));
    }
    if (!duration && !row.bodyweight && action.weight !== undefined) {
      next = mapRow(next, rowIndex, (sets) => cascadeSetField(sets, setIndex, 'weight', String(action.weight), stage));
    }
    return mapRow(next, rowIndex, (sets) => markStage(sets, setIndex, stage, true));
  }

  if (action.action === 'uncompleteSet') {
    let lastCompleted = -1;
    flat.forEach((f, i) => {
      if (f.set.completed) lastCompleted = i;
    });
    if (lastCompleted === -1) return rows;
    const { rowIndex, setIndex, stage } = flat[lastCompleted];
    return mapRow(rows, rowIndex, (sets) => markStage(sets, setIndex, stage, false));
  }

  return rows;
}
