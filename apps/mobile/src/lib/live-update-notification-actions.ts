// No-op surface for web/iOS. Android subscribes through the native Live Update module.
import type { LiveUpdateNotificationAction } from '@/lib/workout-action';

export function subscribeLiveUpdateNotificationActions(
  _onAction: (action: LiveUpdateNotificationAction) => void,
): () => void {
  return () => {};
}
