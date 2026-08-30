import { loadSession } from '@/lib/active-workout-session';
import { handleWorkoutAction } from '@/lib/wear-action-task';
import { parseLiveUpdateNotificationAction } from '@/lib/workout-action';
import '@/lib/workout-surface-sync';

// Headless entry point for a Live Update notification tap arriving with the app
// process dead. A cold process has no in-memory session, so this loads the one
// persisted to disk (src/lib/active-workout-session.ts) before handing off — the
// workout-surface-sync import above registers the notification subscriber in this
// headless JS runtime too, so the resulting set applies, persists, and redraws the
// notification, not just a silent no-op.
export async function liveUpdateNotificationActionTask(data: { json?: string }): Promise<void> {
  try {
    const action = parseLiveUpdateNotificationAction(data?.json ?? '');
    if (!action) return;
    await loadSession();
    await handleWorkoutAction(action);
  } catch (err) {
    console.warn('Live Update notification action task failed', err);
  }
}
