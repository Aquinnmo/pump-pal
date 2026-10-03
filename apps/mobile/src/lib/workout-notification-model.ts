import type { DraftExerciseRow, DraftSubSet } from '@/types/workout';
import { flattenSets as flattenCursor, nextSetIndex, setProgress } from '@/lib/wear-state';
import { groupSupersets, setParts, stageLabel } from '@/lib/workout-conversion';

// This is deliberately a domain-only model. Both notification transports use it
// so the AOD, compact chip, and fallback never disagree about the current set.
export type WorkoutNotificationAction =
  | 'completeSet'
  | 'uncompleteSet'
  | 'finishWorkout';

export type WorkoutNotificationSegment = {
  sets: number;
  // started but not completed is the partially-done state the AOD paints amber;
  // completed is the finished state it paints with the accent.
  started: boolean;
  completed: boolean;
};

export type WorkoutNotificationPresentation = {
  workoutId: string;
  startedAt: Date;
  title: string;
  detail: string | null;
  // Shown counts are sets: a drop set is one set, done once its last drop is.
  completedSets: number;
  totalSets: number;
  // Parts ticked off, drops each counting. Not shown — it is the stale-tap guard
  // (expectedCompletedSets), which must move on every tap, drop by drop.
  completedParts: number;
  segments: WorkoutNotificationSegment[];
  actions: WorkoutNotificationAction[];
  // Every flat set's detail and completion, so iOS can apply a tap natively and
  // derive the next presentation without JS (LiveUpdateSharedStore.swift).
  setDetails: string[];
  setCompleted: boolean[];
  // Per flat entry: true where a set begins, false for a drop continuing it. iOS
  // groups parts into sets with it (LiveUpdateSharedStore.swift).
  setStarts: boolean[];
};

type FlatSet = {
  row: DraftExerciseRow;
  set: DraftSubSet;
  // "Drop 2 of 3" for a drop set's part, else null.
  label: string | null;
};

function nonblankRows(rows: DraftExerciseRow[]): DraftExerciseRow[] {
  return rows.filter((row) => row.label.trim() !== '');
}

// Same order as the phone/watch cursor (supersets interleaved) — iOS applies a tap
// natively by flat index, so any divergence here would complete the wrong set.
function flattenSets(rows: DraftExerciseRow[]): FlatSet[] {
  return flattenCursor(rows).map(({ rowIndex, setIndex, stage, set }) => ({
    row: rows[rowIndex],
    set,
    label: stageLabel(rows[rowIndex].sets[setIndex], stage),
  }));
}

function notificationTitle(workoutName: string): string {
  const name = workoutName.trim();
  if (!name) return 'Logging Workout';
  return /workout$/i.test(name) ? `Logging ${name}` : `Logging ${name} Workout`;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function currentSetDetail(current: FlatSet | undefined): string | null {
  if (!current) return null;

  const { row, set, label } = current;
  const detail = [row.label.trim()];
  if (label) detail.push(label);
  if (row.exerciseType === 'Sets of Duration') {
    const seconds = (Number(set.durationMinutes) || 0) * 60 + (Number(set.durationSeconds) || 0);
    if (seconds > 0) detail.push(formatDuration(seconds));
  } else {
    const reps = Number(set.reps);
    if (Number.isFinite(reps) && reps > 0) detail.push(`${reps} rep${reps === 1 ? '' : 's'}`);
    if (!row.bodyweight) {
      const weight = Number(set.weight);
      if (Number.isFinite(weight) && weight > 0) detail.push(`${weight} lbs`);
    }
  }

  return detail.join(' · ');
}

/**
 * Derives all workout-notification copy and interaction state from the same
 * sequential cursor as the phone and Wear OS. A blank trailing editor row is
 * intentionally excluded from every count and segment.
 */
export function buildWorkoutNotificationPresentation({
  workoutId,
  workoutName,
  startedAt,
  rows,
}: {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  rows: DraftExerciseRow[];
}): WorkoutNotificationPresentation {
  const activeRows = nonblankRows(rows);
  const cursor = flattenCursor(activeRows);
  const flat = flattenSets(activeRows);
  const completedParts = flat.filter(({ set }) => set.completed).length;
  const { completedSets, totalSets } = setProgress(cursor);
  const nextIndex = nextSetIndex(flat.map(({ set }) => set));

  let actions: WorkoutNotificationAction[] = [];
  if (totalSets > 0) {
    if (nextIndex === -1) {
      actions = ['finishWorkout', 'uncompleteSet'];
    } else if (completedParts === 0) {
      actions = ['completeSet'];
    } else {
      actions = ['completeSet', 'uncompleteSet'];
    }
  }

  return {
    workoutId,
    startedAt,
    title: notificationTitle(workoutName),
    detail: currentSetDetail(nextIndex === -1 ? undefined : flat[nextIndex]),
    completedSets,
    totalSets,
    completedParts,
    // One segment per superset, not per exercise: a superset's interleaved sets are
    // contiguous in `flat` only as a group, and iOS rebuilds segments by walking the
    // flat list with these counts (LiveUpdateSharedStore.swift rowSetCounts). Sized in
    // sets — a drop set is one — while started/completed look at every part.
    segments: groupSupersets(activeRows).map((group) => {
      const parts = group.flatMap((row) => row.sets.flatMap(setParts));
      return {
        sets: group.reduce((n, row) => n + row.sets.length, 0),
        started: parts.some((set) => set.completed),
        completed: parts.length > 0 && parts.every((set) => set.completed),
      };
    }),
    actions,
    setDetails: flat.map((set) => currentSetDetail(set) ?? ''),
    setCompleted: flat.map(({ set }) => set.completed === true),
    setStarts: cursor.map(({ stage }) => stage === 0),
  };
}
