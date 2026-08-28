import { AppState } from 'react-native';

import { getSession, subscribe as subscribeSession } from '@/lib/active-workout-session';
import { buildWorkoutNotificationPresentation } from '@/lib/workout-notification-model';
import {
  dismissWorkoutNotification,
  ensureWorkoutChannel,
  showWorkoutNotification,
} from '@/lib/workout-notification';

// The one place that builds and posts the workout notification, replacing three
// sites that all rebuilt the same presentation from the same session (both effects
// in app/active-workout.tsx and the tail of src/lib/wear-action-task.ts). A
// module-level subscriber registered on import — app/_layout.tsx and the headless
// live-update-notification-action-task both import this module for its side effect,
// so it's live whether or not any screen is mounted, cold headless runtime included.

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearPending(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// Re-reads getSession() at call time rather than closing over a snapshot, so a
// debounced fire always reflects the latest edits, not whatever triggered it.
async function postNow(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    await ensureWorkoutChannel();
    await showWorkoutNotification(
      buildWorkoutNotificationPresentation({
        workoutId: session.id,
        workoutName: session.name,
        startedAt: new Date(session.startedAt),
        rows: session.rows,
      }),
    );
  } catch (e) {
    console.warn('[workout-notification] show failed', e);
  }
}

subscribeSession(() => {
  clearPending();
  if (!getSession()) {
    // Ending a session (Finish/Discard, or a stale action landing after either)
    // dismisses it here — no caller has to remember to.
    dismissWorkoutNotification().catch(() => {});
    return;
  }
  // The notification is a live control surface, not a save artifact. While the app
  // is foregrounded iOS hides the Live Activity and its update budget is metered
  // (see pump-pal-byyv), so draft keystrokes must not spend it — only post once
  // backgrounded, and coalesce edits with a short debounce until then.
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (AppState.currentState !== 'active') void postNow();
  }, 1000);
});

let previousAppState = AppState.currentState;
AppState.addEventListener('change', (nextState) => {
  const movedToBackground = previousAppState === 'active' && nextState !== 'active';
  previousAppState = nextState;
  if (!movedToBackground) return;
  clearPending();
  void postNow();
});

// A user-initiated action (a notification or watch button) has to redraw now rather
// than on the debounce above — and in the headless runtime there is no "later" at
// all: React Native ends the task the moment its promise resolves, so a pending
// timer is torn down before it fires. One update per deliberate tap is what the
// ActivityKit budget was always sized for; it's draft keystrokes that must not
// spend it.
export async function flushWorkoutNotification(): Promise<void> {
  clearPending();
  await postNow();
}
