import type { DraftExerciseRow } from '@/types/workout';
import type { WearAction } from '@/utils/wear-state';

export type WorkoutMutationAction = Extract<
  WearAction,
  { action: 'completeSet' | 'uncompleteSet' | 'finishWorkout' }
>;

// Native notification actions include the snapshot they were rendered from.
// Wear messages intentionally remain payload-compatible with the existing protocol.
export type LiveUpdateNotificationAction = WorkoutMutationAction & {
  expectedCompletedSets: number;
};

const MUTATION_ACTIONS: WorkoutMutationAction['action'][] = [
  'completeSet',
  'uncompleteSet',
  'finishWorkout',
];

export function parseLiveUpdateNotificationAction(json: string): LiveUpdateNotificationAction | null {
  try {
    const value = JSON.parse(json) as {
      action?: unknown;
      workoutId?: unknown;
      expectedCompletedSets?: unknown;
    };
    if (
      typeof value?.action !== 'string' ||
      !MUTATION_ACTIONS.includes(value.action as WorkoutMutationAction['action']) ||
      typeof value.workoutId !== 'string' ||
      value.workoutId.trim() === '' ||
      !Number.isSafeInteger(value.expectedCompletedSets) ||
      (value.expectedCompletedSets as number) < 0
    ) {
      return null;
    }
    return {
      action: value.action as WorkoutMutationAction['action'],
      workoutId: value.workoutId,
      expectedCompletedSets: value.expectedCompletedSets as number,
    };
  } catch {
    return null;
  }
}

export function completedSetCount(rows: DraftExerciseRow[]): number {
  return rows
    .filter((row) => row.label.trim() !== '')
    .reduce((count, row) => count + row.sets.filter((set) => set.completed).length, 0);
}

export function matchesExpectedCompletedSets(
  rows: DraftExerciseRow[],
  action: LiveUpdateNotificationAction,
): boolean {
  return completedSetCount(rows) === action.expectedCompletedSets;
}
