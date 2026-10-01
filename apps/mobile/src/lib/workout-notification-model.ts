import type { DraftExerciseRow, DraftSet } from '@/types/workout';
import { flattenSets as flattenCursor, nextSetIndex } from '@/lib/wear-state';
import { groupSupersets } from '@/lib/workout-conversion';

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
  completedSets: number;
  totalSets: number;
  segments: WorkoutNotificationSegment[];
  actions: WorkoutNotificationAction[];
  // Every flat set's detail and completion, so iOS can apply a tap natively and
  // derive the next presentation without JS (LiveUpdateSharedStore.swift).
  setDetails: string[];
  setCompleted: boolean[];
};

type FlatSet = {
  row: DraftExerciseRow;
  set: DraftSet;
};

function nonblankRows(rows: DraftExerciseRow[]): DraftExerciseRow[] {
  return rows.filter((row) => row.label.trim() !== '');
}

// Same order as the phone/watch cursor (supersets interleaved) — iOS applies a tap
// natively by flat index, so any divergence here would complete the wrong set.
function flattenSets(rows: DraftExerciseRow[]): FlatSet[] {
  return flattenCursor(rows).map(({ rowIndex, set }) => ({ row: rows[rowIndex], set }));
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

  const { row, set } = current;
  const detail = [row.label.trim()];
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
  const flat = flattenSets(activeRows);
  const completedSets = flat.filter(({ set }) => set.completed).length;
  const nextIndex = nextSetIndex(flat.map(({ set }) => set));
  const totalSets = flat.length;

  let actions: WorkoutNotificationAction[] = [];
  if (totalSets > 0) {
    if (nextIndex === -1) {
      actions = ['finishWorkout', 'uncompleteSet'];
    } else if (completedSets === 0) {
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
    // One segment per superset, not per exercise: a superset's interleaved sets are
    // contiguous in `flat` only as a group, and iOS rebuilds segments by slicing the
    // flat list with these counts (LiveUpdateSharedStore.swift rowSetCounts).
    segments: groupSupersets(activeRows).map((group) => {
      const sets = group.flatMap((row) => row.sets);
      return {
        sets: sets.length,
        started: sets.some((set) => set.completed),
        completed: sets.length > 0 && sets.every((set) => set.completed),
      };
    }),
    actions,
    setDetails: flat.map((set) => currentSetDetail(set) ?? ''),
    setCompleted: flat.map(({ set }) => set.completed === true),
  };
}
