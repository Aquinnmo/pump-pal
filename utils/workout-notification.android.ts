import notifee, { AndroidImportance } from "@notifee/react-native";
import type { WorkoutNotificationData } from "./workout-notification";

export type { WorkoutNotificationData } from "./workout-notification";

const CHANNEL_ID = "active-workout";
const NOTIFICATION_ID = "active-workout";

export async function ensureWorkoutChannel(): Promise<string> {
  // DEFAULT importance = plays a sound when it first appears. Combined with
  // onlyAlertOnce below, it sounds once on start, not on every set update.
  // Note: Android locks a channel's importance after first creation — if a
  // prior build created this channel silent, reinstall to pick up the change.
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: "Active Workout",
    importance: AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermission(): Promise<void> {
  await notifee.requestPermission();
}

export async function showWorkoutNotification(
  data: WorkoutNotificationData,
): Promise<void> {
  const { name, startedAt, sets, totalReps, volume, currentExercise } = data;
  const parts = [
    `${sets} set${sets === 1 ? "" : "s"}`,
    `${totalReps} rep${totalReps === 1 ? "" : "s"}`,
    `${volume} vol`,
  ];
  const body = name ? `${name} · ${parts.join(" · ")}` : parts.join(" · ");

  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: currentExercise || "Workout In Progress",
    body,
    android: {
      channelId: CHANNEL_ID,
      ongoing: true, // can't be swiped away mid-workout
      onlyAlertOnce: true, // silent on every content refresh
      showChronometer: true, // OS-ticked live elapsed timer
      timestamp: startedAt.getTime(),
      pressAction: { id: "default" }, // tap opens the app
      // ponytail: no smallIcon — Notifee falls back to the app icon (may render
      // as a white square). Add an ic_stat_* drawable if the shade icon looks off.
    },
  });
}

export async function dismissWorkoutNotification(): Promise<void> {
  await notifee.cancelNotification(NOTIFICATION_ID);
}
