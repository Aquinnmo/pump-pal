// iOS implementation: ActivityKit Live Activity via the native Live Update
// module (modules/live-update-notification, ios/ platform). iOS 17+ only —
// unsupported devices simply never post an Activity, no secondary fallback
// surface like Android's Notifee path (see workout-notification.android.ts).

import * as LiveUpdateNotification from '@/modules/live-update-notification';
import type { WorkoutNotificationPresentation } from '@/lib/workout-notification-model';

export type WorkoutSegment = WorkoutNotificationPresentation['segments'][number];
export type WorkoutNotificationData = WorkoutNotificationPresentation;

export async function ensureWorkoutChannel(): Promise<string> {
  // No-op on iOS; kept for call-site symmetry with workout-notification.android.ts.
  return 'active-workout';
}

export async function requestNotificationPermission(): Promise<void> {
  // ActivityKit doesn't require a UNUserNotificationCenter-style prompt.
}

export async function showWorkoutNotification(data: WorkoutNotificationData): Promise<void> {
  LiveUpdateNotification.show({
    workoutId: data.workoutId,
    expectedCompletedSets: data.completedSets,
    title: data.title,
    text: data.detail ?? '',
    startedAtMillis: data.startedAt.getTime(),
    shortCriticalText: `${data.completedSets}/${data.totalSets}`,
    progress: data.completedSets,
    segments: data.segments,
    actions: data.actions,
  });
}

export async function dismissWorkoutNotification(): Promise<void> {
  LiveUpdateNotification.dismiss();
}
