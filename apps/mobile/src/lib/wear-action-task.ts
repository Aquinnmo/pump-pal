import { getSession, updateSession } from '@/lib/active-workout-session';
import { applyWearAction, buildWearActiveState, WearAction } from '@/lib/wear-state';
import { matchesExpectedCompletedSets, type LiveUpdateNotificationAction } from '@/lib/workout-action';
import { pushWearState } from '@/lib/wear-sync';
import { flushWorkoutNotification } from '@/lib/workout-surface-sync';

// Fallback path for a completeSet/uncompleteSet action arriving while the
// active-workout screen isn't mounted (including a cold process — the caller loads
// the persisted session first, see live-update-notification-action-task.ts) to apply
// it to its own draft state directly (app/active-workout.tsx's own remote-finish
// listener still owns finishWorkout — see the comment there for why). Both surfaces
// converge on the same in-memory session (src/lib/active-workout-session.ts), so
// there is nothing left to reconcile once this writes back to it.
//
// finishWorkout is not handled here: finishing always writes to the repository, and
// that write only ever happens through the active-workout screen's own Finish flow.
// A finishWorkout action with the screen unmounted has nothing to act on.
//
// A rejected or no-op action returns before touching the session, so nothing is
// flushed — the surface already shows authoritative state and a corrective redraw
// would only spend ActivityKit's metered update budget.
export async function handleWorkoutAction(
  action: WearAction | LiveUpdateNotificationAction,
): Promise<void> {
  if (action.action !== 'completeSet' && action.action !== 'uncompleteSet') return;

  const session = getSession();
  if (!session || action.workoutId !== session.id) return;
  if ('expectedCompletedSets' in action && !matchesExpectedCompletedSets(session.rows, action)) return;

  const next = applyWearAction(session.rows, action);
  if (next === session.rows) return;
  updateSession(next);

  pushWearState(buildWearActiveState(session.id, session.name, next));
  // Awaited, not left to the store subscriber's debounce: on a cold process this
  // runs in a headless task that ends as soon as this promise resolves.
  await flushWorkoutNotification();
}
