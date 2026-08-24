// iOS implementation: ActivityKit Live Activity via the native Live Update
// module (modules/live-update-notification, ios/ platform). iOS 17+ only —
// unsupported devices simply never post an Activity, no secondary fallback
// surface like Android's Notifee path (see workout-notification.android.ts).

import * as LiveUpdateNotification from '@/modules/live-update-notification';
import type { WorkoutNotificationPresentation } from '@/lib/workout-notification-model';

export type WorkoutSegment = WorkoutNotificationPresentation['segments'][number];
export type WorkoutNotificationData = WorkoutNotificationPresentation;

let warnedAboutMissingModule = false;
let warnedAboutDisabledActivities = false;
let warnedAboutShowFailure = false;

function warnOnce(kind: 'missing-module' | 'disabled' | 'show-failed', message: string): void {
  if (!__DEV__) return;

  if (kind === 'missing-module') {
    if (warnedAboutMissingModule) return;
    warnedAboutMissingModule = true;
  } else if (kind === 'disabled') {
    if (warnedAboutDisabledActivities) return;
    warnedAboutDisabledActivities = true;
  } else {
    if (warnedAboutShowFailure) return;
    warnedAboutShowFailure = true;
  }

  console.warn(`[workout-notification] ${message}`);
}

export async function ensureWorkoutChannel(): Promise<string> {
  // No-op on iOS; kept for call-site symmetry with workout-notification.android.ts.
  return 'active-workout';
}

export async function requestNotificationPermission(): Promise<void> {
  // ActivityKit doesn't require a UNUserNotificationCenter-style prompt.
}

export async function showWorkoutNotification(data: WorkoutNotificationData): Promise<void> {
  if (!LiveUpdateNotification.isNativeModuleAvailable()) {
    warnOnce(
      'missing-module',
      'The LiveUpdateNotification native module is unavailable. Rebuild the iOS development client with the local module before testing Live Activities.',
    );
    return;
  }

  if (!LiveUpdateNotification.isSupported()) {
    warnOnce(
      'disabled',
      'Live Activities are unavailable. Use iOS 17+ and enable Live Activities for Timber in Settings; no iOS notification fallback is provided.',
    );
    return;
  }

  const payload = {
    workoutId: data.workoutId,
    expectedCompletedSets: data.completedSets,
    title: data.title,
    text: data.detail ?? '',
    startedAtMillis: data.startedAt.getTime(),
    shortCriticalText: `${data.completedSets}/${data.totalSets}`,
    progress: data.completedSets,
    segments: data.segments,
    actions: data.actions,
  };

  const didShow = LiveUpdateNotification.show(payload);

  if (!didShow) {
    warnOnce(
      'show-failed',
      'The Live Activity could not be started. Check that Live Activities are enabled for Timber and that the app has an iOS 17+ ActivityKit-capable host.',
    );
    return;
  }

}

export async function dismissWorkoutNotification(): Promise<void> {
  LiveUpdateNotification.dismiss();
}
