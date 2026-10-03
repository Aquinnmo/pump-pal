export type LiveUpdateSegment = {
  sets: number;
  started: boolean;
  completed: boolean;
};

export type LiveUpdateNotificationPayload = {
  workoutId: string;
  // Parts completed (a drop set's drops each count) — the stale-tap guard.
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
  // Parallel to setCompleted: false marks a drop continuing the set before it.
  setStarts?: boolean[];
  latencyTraceId?: string;
  latencyStartedAtMs?: number;
};
