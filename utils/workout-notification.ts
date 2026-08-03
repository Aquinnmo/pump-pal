// No-op stub for web/iOS. The real implementation lives in
// workout-notification.android.ts and Metro serves it only on Android.
// (Notifee is Android-only here — see docs/... / issue pump-pal-8ew.)

import type { WorkoutNotificationPresentation } from '@/utils/workout-notification-model';

export type WorkoutSegment = WorkoutNotificationPresentation['segments'][number];
export type WorkoutNotificationData = WorkoutNotificationPresentation;

export async function ensureWorkoutChannel(): Promise<string> {
  return 'active-workout';
}

export async function requestNotificationPermission(): Promise<void> {}

export async function showWorkoutNotification(_data: WorkoutNotificationData): Promise<void> {}

export async function dismissWorkoutNotification(): Promise<void> {}
