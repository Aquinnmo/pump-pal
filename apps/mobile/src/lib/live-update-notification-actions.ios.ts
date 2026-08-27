import { drainPendingAction, subscribeActions } from '@/modules/live-update-notification';
import {
  parseLiveUpdateNotificationAction,
  type LiveUpdateNotificationAction,
} from '@/lib/workout-action';

type ActionOwner = 'root' | 'active-workout';

// The root layout and active-workout screen intentionally subscribe separately:
// the former owns set mutations and the latter owns Finish's repository write. A
// force-quit action is drained during the first subscription, then replayed once to
// each ownership path that is currently mounting instead of being lost to ordering.
const listeners = new Map<
  (action: LiveUpdateNotificationAction) => void,
  ActionOwner
>();
const deliveredOwners = new Set<ActionOwner>();
let nativeUnsubscribe: (() => void) | null = null;
let pendingLoaded = false;
let pendingJson: string | null = null;
let pendingReleaseTimer: ReturnType<typeof setTimeout> | null = null;

function releasePendingAction(): void {
  pendingJson = null;
  deliveredOwners.clear();
  if (pendingReleaseTimer !== null) {
    clearTimeout(pendingReleaseTimer);
    pendingReleaseTimer = null;
  }
}

function markPendingDelivered(owner: ActionOwner, json: string): void {
  if (pendingJson !== json) return;
  deliveredOwners.add(owner);
  if (deliveredOwners.has('root') && deliveredOwners.has('active-workout')) {
    releasePendingAction();
  }
}

function deliver(json: string): void {
  const action = parseLiveUpdateNotificationAction(json);
  if (!action) return;

  const deliveredForOwner = new Set<ActionOwner>();
  for (const [listener, owner] of listeners) {
    if (deliveredForOwner.has(owner)) continue;
    deliveredForOwner.add(owner);
    try {
      listener(action);
    } finally {
      markPendingDelivered(owner, json);
    }
  }
}

export function subscribeLiveUpdateNotificationActions(
  onAction: (action: LiveUpdateNotificationAction) => void,
  owner: ActionOwner = 'root',
): () => void {
  listeners.set(onAction, owner);

  // App Intents run in the widget-extension process; a tap while the host app was
  // fully terminated only reaches us via this App Group outbox, not the Darwin
  // notification below (which requires a live process to observe it).
  if (!pendingLoaded) {
    const candidate = drainPendingAction();
    pendingJson = candidate && parseLiveUpdateNotificationAction(candidate) ? candidate : null;
    pendingLoaded = true;
    if (pendingJson) {
      // If the active screen never mounts, do not retain a completed action for the
      // lifetime of the process. A screen mounting within this window still receives
      // its ownership replay and stale guards make any later duplicate harmless.
      pendingReleaseTimer = setTimeout(releasePendingAction, 10_000);
    }
  }

  if (!nativeUnsubscribe) {
    nativeUnsubscribe = subscribeActions(deliver);
  }

  if (pendingJson && !deliveredOwners.has(owner)) {
    const replay = pendingJson;
    // Match native event delivery's asynchronous behavior and avoid re-entering a
    // subscriber while it is still mounting.
    queueMicrotask(() => {
      if (!listeners.has(onAction) || deliveredOwners.has(owner)) return;
      const action = parseLiveUpdateNotificationAction(replay);
      if (!action) {
        releasePendingAction();
        return;
      }
      try {
        onAction(action);
      } finally {
        markPendingDelivered(owner, replay);
      }
    });
  }

  return () => {
    listeners.delete(onAction);
    if (listeners.size === 0 && nativeUnsubscribe) {
      nativeUnsubscribe();
      nativeUnsubscribe = null;
    }
  };
}
