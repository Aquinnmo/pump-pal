import { drainPendingAction, subscribeActions } from '@/modules/live-update-notification';
import {
  parseLiveUpdateNotificationAction,
  type LiveUpdateNotificationAction,
} from '@/lib/workout-action';

export function subscribeLiveUpdateNotificationActions(
  onAction: (action: LiveUpdateNotificationAction) => void,
): () => void {
  const deliver = (json: string) => {
    const action = parseLiveUpdateNotificationAction(json);
    if (action) onAction(action);
  };

  // App Intents run in the widget-extension process; a tap while the host app was
  // fully terminated only reaches us via this App Group outbox, not the Darwin
  // notification below (which requires a live process to observe it).
  const pending = drainPendingAction();
  if (pending) deliver(pending);

  return subscribeActions(deliver);
}
