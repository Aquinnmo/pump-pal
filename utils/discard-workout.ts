import { workoutRepository } from '@/db/workout-repository';
import { dismissWorkoutNotification } from '@/utils/workout-notification';
import { pushWearState } from '@/utils/wear-sync';
import { buildWearIdleState } from '@/utils/wear-state';
import { describeUpNext } from '@/utils/up-next';

/**
 * One-time cleanup for a device that still has an 'in_progress' row from before the
 * memory-first workout rewrite (see utils/active-workout-session.ts) — the app no
 * longer produces that status, resumes from an in-memory session instead, and has no
 * code path left that will ever finish or discard an old on-disk one. Restore a
 * plan-sourced row to the planned queue with its sets cleared (the old Discard
 * behavior) or soft-delete an ad-hoc one, so it doesn't sit there forever.
 * Called once per app start, after auth resolves, from app/_layout.tsx.
 */
export async function sweepLegacyInProgressWorkouts(uid: string): Promise<void> {
  const stale = await workoutRepository.getByStatus(uid, 'in_progress');
  if (stale.length === 0) return;

  for (const record of stale) {
    const workout = record.data;
    // Same test the old active-workout screen used to decide `cameFromPlan`.
    if (workout.queueOrder !== undefined) {
      const performedExercises = (workout.performedExercises ?? []).map((pe) => ({
        ...pe,
        sets: pe.sets.map(({ completed, ...rest }) => rest),
      }));
      const restored = {
        ...workout,
        status: 'planned' as const,
        performedExercises,
        updatedAt: new Date().toISOString(),
      };
      delete restored.startedAt;
      await workoutRepository.update(uid, workout.id, restored);
    } else {
      await workoutRepository.softDelete(uid, workout.id);
    }
  }

  await dismissWorkoutNotification();
  pushWearState(buildWearIdleState(describeUpNext({})));
}
