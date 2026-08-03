import { auth } from '@/config/firebase';
import { handleWorkoutAction } from '@/utils/wear-action-task';
import { parseLiveUpdateNotificationAction } from '@/utils/workout-action';

// Kept as a separate headless entry point because Android names tasks at native
// registration time. Its domain work is shared exactly with the Wear task.
export async function liveUpdateNotificationActionTask(data: { json?: string }): Promise<void> {
  try {
    const action = parseLiveUpdateNotificationAction(data?.json ?? '');
    if (!action) return;
    await auth.authStateReady();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await handleWorkoutAction(action, uid);
  } catch (err) {
    console.warn('Live Update notification action task failed', err);
  }
}
