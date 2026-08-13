import { handleWorkoutAction } from '@/lib/wear-action-task';
import { parseLiveUpdateNotificationAction } from '@/lib/workout-action';

// Headless entry point for a Live Update notification tap arriving with the app
// process dead. A cold process has no in-memory session, so handleWorkoutAction
// always no-ops here — kept registered because native code launches straight into
// whichever task name the notification's PendingIntent carries, with no way to skip
// registration for "the app happens to be dead right now."
export async function liveUpdateNotificationActionTask(data: { json?: string }): Promise<void> {
  try {
    const action = parseLiveUpdateNotificationAction(data?.json ?? '');
    if (!action) return;
    await handleWorkoutAction(action);
  } catch (err) {
    console.warn('Live Update notification action task failed', err);
  }
}
