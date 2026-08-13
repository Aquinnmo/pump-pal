import { subscribeActions } from '@/modules/live-update-notification';
import {
  parseLiveUpdateNotificationAction,
  type LiveUpdateNotificationAction,
} from '@/lib/workout-action';

export function subscribeLiveUpdateNotificationActions(
  onAction: (action: LiveUpdateNotificationAction) => void,
): () => void {
  return subscribeActions((json) => {
    const action = parseLiveUpdateNotificationAction(json);
    if (action) onAction(action);
  });
}
