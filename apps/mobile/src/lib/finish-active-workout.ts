import type { DraftSet, Workout } from '@/types/workout';
import { workoutRepository } from '@/data/workout-repository';
import { triggerSyncAfterWrite } from '@/data/sync-trigger';
import { createKeyedMutex } from '@/data/keyed-mutex';
import { endSession, getSession, type ActiveSession } from '@/lib/active-workout-session';
import { getOngoingInjuryIds } from '@/lib/injuries';
import { buildPerformedExercise } from '@/lib/workout-conversion';
import { buildWearIdleState } from '@/lib/wear-state';
import { pushWearState } from '@/lib/wear-sync';
import { describeUpNext } from '@/lib/up-next';

// A set counts once its first part is done; of a drop set's drops, only the done ones.
function completedParts(sets: DraftSet[]): DraftSet[] {
  return sets
    .filter(set => set.completed)
    .map(set => (set.subSets ? { ...set, subSets: set.subSets.filter(part => part.completed) } : set));
}

const finishing = createKeyedMutex<boolean>();
const finishedListeners = new Set<(sessionId: string) => void>();

export function subscribeWorkoutFinished(listener: (sessionId: string) => void): () => void {
  finishedListeners.add(listener);
  return () => { finishedListeners.delete(listener); };
}

export function isFinishingWorkout(sessionId: string): boolean {
  return finishing.isRunning(sessionId);
}

/** Saves the same confirmed workout from the screen or an iOS background intent. */
export function finishActiveWorkout(
  uid: string,
  snapshot: ActiveSession,
  durableId = false,
  // A Finish queued from the Live Activity records the tap, not the replay.
  finishedAt = Date.now(),
): Promise<boolean> {
  return finishing.run(snapshot.id, async () => {
    if (snapshot.uid !== uid) throw new Error('Workout belongs to another account.');
    const id = snapshot.planId ?? (durableId ? snapshot.id : null);
    const stored = id ? await workoutRepository.getById(uid, id) : null;
    // iOS uses the session id as the local row id. A process can die after SQLite
    // commits but before the intent is acknowledged; this read makes retry safe.
    if (!stored || stored.data.status !== 'completed' || !durableId) {
      if (getSession()?.id !== snapshot.id) return false;
      if (snapshot.planId && !stored) throw new Error('Workout no longer exists.');
      const performedExercises = snapshot.rows
        .filter(row => row.label.trim() !== '')
        .map((row, order) => buildPerformedExercise({ ...row, sets: completedParts(row.sets) }, order))
        .filter(exercise => exercise.sets.length > 0)
        .map(exercise => ({ ...exercise, sets: exercise.sets.map(({ completed, ...set }) => set) }));
      const injuries = await getOngoingInjuryIds(uid);
      const now = new Date().toISOString();
      const startedMs = new Date(snapshot.startedAt).getTime();
      const data: Omit<Workout, 'id' | 'userId'> = {
        ...(snapshot.planId ? stored!.data : {}),
        schemaVersion: 2,
        name: snapshot.name || 'Workout', date: new Date(finishedAt).toISOString(), performedExercises, status: 'completed' as const,
        injuries, startedAt: Number.isFinite(startedMs) ? snapshot.startedAt : now,
        durationSeconds: Number.isFinite(startedMs) && startedMs <= finishedAt
          ? Math.floor((finishedAt - startedMs) / 1000) : null,
        updatedAt: now,
        ...(!snapshot.planId ? { createdAt: now } : {}),
      };
      if (getSession()?.id !== snapshot.id) return false;
      if (id) {
        // Native update is an atomic upsert + outbox write, including new rows.
        await workoutRepository.update(uid, id, { ...data, id, userId: uid });
      } else {
        await workoutRepository.create(uid, data);
      }
    }
    triggerSyncAfterWrite();
    if (getSession()?.id === snapshot.id) {
      pushWearState(buildWearIdleState(describeUpNext({})));
      endSession();
      finishedListeners.forEach(listener => listener(snapshot.id));
    }
    return true;
  });
}
