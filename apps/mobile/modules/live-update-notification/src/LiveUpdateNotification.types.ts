export type LiveUpdateSegment = {
  sets: number;
  started: boolean;
  completed: boolean;
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
  // iOS only: lets a Live Activity tap be applied natively (see the store).
  setDetails?: string[];
  setCompleted?: boolean[];
  latencyTraceId?: string;
  latencyStartedAtMs?: number;
};
