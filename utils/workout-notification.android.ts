import notifee, { AndroidImportance } from '@notifee/react-native';
import type { WorkoutNotificationData } from './workout-notification';

export type { WorkoutNotificationData } from './workout-notification';

const CHANNEL_ID = 'active-workout';
const NOTIFICATION_ID = 'active-workout';

export async function ensureWorkoutChannel(): Promise<string> {
  // LOW importance = ongoing, silent (no sound/vibration) — this is a status
  // notification, not an alert.
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Active Workout',
    importance: AndroidImportance.LOW,
  });
}

export async function requestNotificationPermission(): Promise<void> {
  await notifee.requestPermission();
}

export async function showWorkoutNotification(data: WorkoutNotificationData): Promise<void> {
  const { name, startedAt, totalReps, volume, currentExercise } = data;
  const parts = [`${totalReps} rep${totalReps === 1 ? '' : 's'}`, `${volume} vol`];
  if (currentExercise) parts.push(currentExercise);

  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: name || 'Workout in progress',
    body: parts.join(' · '),
    android: {
      channelId: CHANNEL_ID,
      ongoing: true, // can't be swiped away mid-workout
      onlyAlertOnce: true, // silent on every content refresh
      showChronometer: true, // OS-ticked live elapsed timer
      timestamp: startedAt.getTime(),
      pressAction: { id: 'default' }, // tap opens the app
      // ponytail: no smallIcon — Notifee falls back to the app icon (may render
      // as a white square). Add an ic_stat_* drawable if the shade icon looks off.
    },
  });
}

export async function dismissWorkoutNotification(): Promise<void> {
  await notifee.cancelNotification(NOTIFICATION_ID);
}
