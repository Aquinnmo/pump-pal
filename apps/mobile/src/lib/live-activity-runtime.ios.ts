import { auth } from '@/config/firebase';
import { configureSyncTrigger } from '@/data/sync-trigger';
import { loadSession } from '@/lib/active-workout-session';
import { finishActiveWorkout, isFinishingWorkout } from '@/lib/finish-active-workout';
import { subscribeLiveUpdateNotificationActions } from '@/lib/live-update-notification-actions.ios';
import { buildWorkoutNotificationPresentation } from '@/lib/workout-notification-model';
import { dismissWorkoutNotification } from '@/lib/workout-notification.ios';
import { handleWorkoutAction } from '@/lib/wear-action-task';
import type { LiveUpdateNotificationAction } from '@/lib/workout-action';
import '@/lib/workout-surface-sync';

// Loaded by index.js, before any React screen. LiveActivityIntent may start the
// JS host without connecting a UIKit scene or mounting the router's root view.
configureSyncTrigger(() => ({ uid: auth.currentUser?.uid ?? null, currentUid: auth.currentUser?.uid ?? null }));

export async function processIosWorkoutAction(action: LiveUpdateNotificationAction): Promise<boolean> {
  await auth.authStateReady();
  const session = await loadSession();
  if (!session) {
    await dismissWorkoutNotification();
    return false;
  }
  if (session.uid !== auth.currentUser?.uid || session.id !== action.workoutId) return false;
  const state = buildWorkoutNotificationPresentation({
    workoutId: session.id, workoutName: session.name, startedAt: new Date(session.startedAt), rows: session.rows,
  });
  if (state.completedSets !== action.expectedCompletedSets || !state.actions.includes(action.action)) return false;
  if (action.action === 'finishWorkout') {
    const finished = await finishActiveWorkout(session.uid, session, true);
    if (finished) await dismissWorkoutNotification();
    return finished;
  }
  if (isFinishingWorkout(session.id)) return false;
  await handleWorkoutAction(action, true);
  return true;
}

subscribeLiveUpdateNotificationActions(processIosWorkoutAction, 'root');
