import notifee, { AndroidImportance } from "@notifee/react-native";
import * as LiveUpdateNotification from "@/modules/live-update-notification";
import type { WorkoutNotificationData } from "./workout-notification";

export type { WorkoutNotificationData } from "./workout-notification";

const CHANNEL_ID = "active-workout";
const NOTIFICATION_ID = "active-workout";

// Resolved once per workout (in ensureWorkoutChannel) and latched to false the
// moment a native show() fails, so Notifee and the Live Update module can
// never both post — that would show the user two notifications.
let useLiveUpdate: boolean | null = null;

export async function ensureWorkoutChannel(): Promise<string> {
  // LOW importance = no sound, no heads-up popup, still visible in the shade.
  // Note: Android locks a channel's importance after first creation — if a
  // prior build created this channel with DEFAULT (sound), reinstall to pick
  // up the change.
  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Active Workout",
    importance: AndroidImportance.LOW,
  });
  // The native module reuses this same channel by ID, so it must exist
  // whichever surface ends up posting.
  useLiveUpdate = LiveUpdateNotification.isSupported();
  return channelId;
}

export async function requestNotificationPermission(): Promise<void> {
  await notifee.requestPermission();
}

export async function showWorkoutNotification(
  data: WorkoutNotificationData,
): Promise<void> {
  const { startedAt, completedSets, totalSets, segments, title, detail } = data;

  if (useLiveUpdate) {
    const posted = LiveUpdateNotification.show({
      workoutId: data.workoutId,
      expectedCompletedSets: completedSets,
      title,
      text: detail ?? '',
      startedAtMillis: startedAt.getTime(),
      shortCriticalText: `${completedSets}/${totalSets}`,
      progress: completedSets,
      segments,
      actions: data.actions,
    });
    if (posted) {
      // ensureWorkoutChannel resolves useLiveUpdate asynchronously, so an
      // earlier refresh may already have posted via Notifee before this
      // effect settled. Clear it so the two surfaces never both show.
      await notifee.cancelNotification(NOTIFICATION_ID);
      return;
    }
    // Native surface rejected the notification (not promotable, etc.) — latch
    // to Notifee for the rest of this workout and fall through so this
    // refresh isn't dropped.
    useLiveUpdate = false;
  }

  // Mirrors the cancel above: useLiveUpdate may flip true between refreshes,
  // so clear a stale native notification before Notifee posts.
  LiveUpdateNotification.dismiss();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title,
    ...(detail ? { body: detail } : {}),
    android: {
      channelId: CHANNEL_ID,
      ongoing: true, // can't be swiped away mid-workout
      onlyAlertOnce: true, // silent on every content refresh
      showChronometer: true, // OS-ticked live elapsed timer
      timestamp: startedAt.getTime(),
      pressAction: { id: "default" }, // tap opens the app
      smallIcon: "ic_stat_timber",
    },
  });
}

export async function dismissWorkoutNotification(): Promise<void> {
  LiveUpdateNotification.dismiss();
  await notifee.cancelNotification(NOTIFICATION_ID);
  useLiveUpdate = null;
}
