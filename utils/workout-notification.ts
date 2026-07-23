// No-op stub for web/iOS. The real implementation lives in
// workout-notification.android.ts and Metro serves it only on Android.
// (Notifee is Android-only here — see docs/... / issue pump-pal-8ew.)

export type WorkoutNotificationData = {
  name: string;
  startedAt: Date;
  sets: number;
  totalReps: number;
  volume: number;
  currentExercise: string | null;
};

export async function ensureWorkoutChannel(): Promise<string> {
  return 'active-workout';
}

export async function requestNotificationPermission(): Promise<void> {}

export async function showWorkoutNotification(_data: WorkoutNotificationData): Promise<void> {}

export async function dismissWorkoutNotification(): Promise<void> {}
