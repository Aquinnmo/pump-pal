import { workoutRepository } from '@/db/workout-repository';
import { DraftExerciseRow, PerformedExercise } from '@/types/workout';
import { createLatestWriteQueue, LatestWriteQueue } from '@/utils/latest-write-queue';
import { buildWearActiveState } from '@/utils/wear-state';
import { pushWearState } from '@/utils/wear-sync';
import { buildPerformedExercise } from '@/utils/workout-conversion';

export type ActiveWorkoutDraftSnapshot = {
  uid: string;
  workoutId: string;
  workoutName: string;
  rows: DraftExerciseRow[];
};

const queues = new Map<string, LatestWriteQueue<ActiveWorkoutDraftSnapshot>>();

function queueKey(uid: string, workoutId: string): string {
  return `${uid}:${workoutId}`;
}

async function writeDraft(snapshot: ActiveWorkoutDraftSnapshot): Promise<void> {
  const performedExercises: PerformedExercise[] = snapshot.rows
    .filter((exercise) => exercise.label.trim() !== '')
    .map((exercise, order) => buildPerformedExercise(exercise, order));
  const stored = await workoutRepository.getById(snapshot.uid, snapshot.workoutId);
  if (!stored) throw new Error('Workout no longer exists.');

  // A queued draft can finish after a terminal mutation only if a caller broke
  // the lifecycle ordering. Refuse to move completed/planned state backwards.
  if (stored.data.status !== 'in_progress') return;

  await workoutRepository.update(snapshot.uid, snapshot.workoutId, {
    ...stored.data,
    name: snapshot.workoutName,
    performedExercises,
    updatedAt: new Date().toISOString(),
  });
  pushWearState(
    buildWearActiveState(snapshot.workoutId, snapshot.workoutName, snapshot.rows),
  );
}

function getQueue(uid: string, workoutId: string): LatestWriteQueue<ActiveWorkoutDraftSnapshot> {
  const key = queueKey(uid, workoutId);
  let queue = queues.get(key);
  if (!queue) {
    queue = createLatestWriteQueue(writeDraft);
    queues.set(key, queue);
  }
  return queue;
}

export function scheduleActiveWorkoutDraft(snapshot: ActiveWorkoutDraftSnapshot): Promise<void> {
  return getQueue(snapshot.uid, snapshot.workoutId).schedule(snapshot);
}

export function flushActiveWorkoutDraft(snapshot: ActiveWorkoutDraftSnapshot): Promise<void> {
  return getQueue(snapshot.uid, snapshot.workoutId).flush(snapshot);
}

export function flushPendingActiveWorkoutDraft(uid: string, workoutId: string): Promise<void> {
  return queues.get(queueKey(uid, workoutId))?.flush() ?? Promise.resolve();
}

export function releaseActiveWorkoutDraft(uid: string, workoutId: string): void {
  const key = queueKey(uid, workoutId);
  const queue = queues.get(key);
  if (queue && !queue.hasPending()) queues.delete(key);
}
