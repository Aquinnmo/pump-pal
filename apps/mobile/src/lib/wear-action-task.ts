import { getSession, updateSession } from '@/lib/active-workout-session';
import { buildWorkoutNotificationPresentation } from '@/lib/workout-notification-model';
import { ensureWorkoutChannel, showWorkoutNotification } from '@/lib/workout-notification';
import { applyWearAction, buildWearActiveState, WearAction } from '@/lib/wear-state';
import { matchesExpectedCompletedSets, type LiveUpdateNotificationAction } from '@/lib/workout-action';
import { pushWearState } from '@/lib/wear-sync';

// Fallback path for a completeSet/uncompleteSet action arriving while the
// active-workout screen isn't mounted to apply it to its own draft state directly
// (app/active-workout.tsx's own remote-finish listener still owns finishWorkout —
// see the comment there for why). Both surfaces converge on the same in-memory
// session (src/lib/active-workout-session.ts), so there is nothing left to reconcile
// once this writes back to it.
//
// finishWorkout is not handled here: finishing always writes to the repository, and
// that write only ever happens through the active-workout screen's own Finish flow.
// A finishWorkout action with the screen unmounted has nothing to act on — same for
// every action once the process is cold, since a cold process has no session at all.
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

  await ensureWorkoutChannel();
  await showWorkoutNotification(
    buildWorkoutNotificationPresentation({
      workoutId: session.id,
      workoutName: session.name,
      startedAt: new Date(session.startedAt),
      rows: next,
    }),
  );
}
