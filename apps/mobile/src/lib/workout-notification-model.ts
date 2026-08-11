import type { DraftExerciseRow, DraftSet } from '@/types/workout';
import { nextSetIndex } from '@/lib/wear-state';

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
};

type FlatSet = {
  row: DraftExerciseRow;
  set: DraftSet;
};

function nonblankRows(rows: DraftExerciseRow[]): DraftExerciseRow[] {
  return rows.filter((row) => row.label.trim() !== '');
}

function flattenSets(rows: DraftExerciseRow[]): FlatSet[] {
  return rows.flatMap((row) =>
    row.sets.map((set) => ({ row, set })),
  );
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
    segments: activeRows.map((row) => ({
      sets: row.sets.length,
      started: row.sets.some((set) => set.completed),
      completed: row.sets.length > 0 && row.sets.every((set) => set.completed),
    })),
    actions,
  };
}
