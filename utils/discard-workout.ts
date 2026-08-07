import { workoutRepository } from '@/db/workout-repository';
import { dismissWorkoutNotification } from '@/utils/workout-notification';
import { pushWearState } from '@/utils/wear-sync';
import { buildWearIdleState } from '@/utils/wear-state';
import { describeUpNext } from '@/utils/up-next';
import { PerformedExercise } from '@/types/workout';

/**
 * Ends a live workout without recording it, and clears everything that was
 * pointing at it. Shared by the active-workout screen's Discard button and by
 * sign-out, which auto-discards — an in-progress workout is device-local and
 * would otherwise be destroyed silently when the local data is purged.
 *
 * A workout started from a plan goes back to the planned queue with its sets
 * cleared: the plan is the user's, and only the session is being thrown away.
 * An ad-hoc one is deleted — it was never saved as anything.
 *
 * `draftExercises` lets a screen pass state fresher than the ~800ms autosave.
 * Without it the stored row is the truth, which is what sign-out sees.
 */
export async function discardActiveWorkout(
  uid: string,
  workoutId: string,
  draftExercises?: PerformedExercise[]
): Promise<void> {
  const stored = await workoutRepository.getById(uid, workoutId);
  if (!stored) throw new Error('Workout no longer exists.');

  // Same test app/active-workout.tsx uses to decide `cameFromPlan`.
  if (stored.data.queueOrder !== undefined) {
    const source = draftExercises ?? stored.data.performedExercises ?? [];
    // A planned workout must not carry ticked sets — autosave writes `completed`
    // through buildPerformedExercise, so strip it on the way back to the queue.
    const performedExercises: PerformedExercise[] = source.map((pe) => ({
      ...pe,
      sets: pe.sets.map(({ completed, ...rest }) => rest),
    }));
    const restored = {
      ...stored.data,
      status: 'planned' as const,
      performedExercises,
      updatedAt: new Date().toISOString(),
    };
    delete restored.startedAt;
    await workoutRepository.update(uid, workoutId, restored);
  } else {
    await workoutRepository.softDelete(uid, workoutId);
  }

  await dismissWorkoutNotification();
  // Clear the watch immediately; Home pushes the real Up Next copy a moment
  // later when it regains focus.
  pushWearState(buildWearIdleState(describeUpNext({})));
}
