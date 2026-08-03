export type LiveUpdateSegment = {
  sets: number;
  started: boolean;
};

export type LiveUpdateNotificationPayload = {
  workoutId: string;
  expectedCompletedSets: number;
  title: string;
  text: string;
  startedAtMillis: number;
  shortCriticalText: string;
  progress: number;
  segments: LiveUpdateSegment[];
  actions: Array<'completeSet' | 'uncompleteSet' | 'finishWorkout'>;
};
