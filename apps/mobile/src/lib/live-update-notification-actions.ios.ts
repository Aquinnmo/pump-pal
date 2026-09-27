import { acknowledgeAction, readPendingAction, subscribeActions } from '@/modules/live-update-notification';
import { flushSessionPersistence } from '@/lib/active-workout-session';
import { parseLiveUpdateNotificationAction, type LiveUpdateNotificationAction } from '@/lib/workout-action';

type Listener = (action: LiveUpdateNotificationAction) => unknown;
const roots = new Set<Listener>();
const processing = new Set<string>();
let unsubscribeNative: (() => void) | null = null;

async function deliver(json: string): Promise<void> {
  const action = parseLiveUpdateNotificationAction(json);
  const listener = roots.values().next().value;
  if (!action || !listener) return;
  const { actionId } = JSON.parse(json) as { actionId?: string };
  if (typeof actionId !== 'string' || actionId === '' || processing.has(actionId)) return;
  processing.add(actionId);
  let succeeded = false;
  try {
    succeeded = (await listener(action)) !== false;
    await flushSessionPersistence();
  } catch (error) {
    succeeded = false;
    console.warn('[Live Activity] action failed', error);
  } finally {
    try {
      await acknowledgeAction(actionId, succeeded);
    } catch (error) {
      console.warn('[Live Activity] acknowledgement failed', error);
    } finally {
      processing.delete(actionId);
    }
  }
}

export function subscribeLiveUpdateNotificationActions(
  onAction: Listener,
  owner: 'root' | 'active-workout' = 'root',
): () => void {
  // One host owner handles every iOS action, including Finish without a screen.
  if (owner !== 'root') return () => {};
  roots.add(onAction);
  if (!unsubscribeNative) unsubscribeNative = subscribeActions(json => { void deliver(json); });
  const pending = readPendingAction();
  if (pending) queueMicrotask(() => { void deliver(pending); });
  return () => {
    roots.delete(onAction);
    if (roots.size === 0) {
      unsubscribeNative?.();
      unsubscribeNative = null;
    }
  };
}
