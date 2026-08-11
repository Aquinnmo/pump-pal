import { workoutRepository } from '@/data/workout-repository';
import { Workout } from '@/types/workout';
import { predictNextWorkoutName } from '@/lib/predict-next-workout';
import { loadSplitNames } from '@/lib/split-names';

// Resolves what "Up next" actually points at, from scratch. The widget's cached copy
// can be stale, so the pumppal://up-next landing screen re-resolves here — same
// priority chain as the Home screen's Up Next card: head of the planned queue, then
// the split's predicted next day. A live workout is memory-only now (see
// src/lib/active-workout-session.ts) and has no Firestore id to return — the
// active-workout screen itself checks for one before it ever calls this.
export async function resolveUpNextTarget(uid: string): Promise<{ id?: string; suggestion?: string }> {
  const planned = await workoutRepository.getByStatus(uid, 'planned');
  const nextPlan = [...planned].sort((a, b) => (a.data.queueOrder ?? Infinity) - (b.data.queueOrder ?? Infinity))[0];
  if (nextPlan) return { id: nextPlan.id };

  const history = (await workoutRepository.getHistory(uid))
    .map((record) => record.data)
    .slice(0, 30) as Workout[];
  const suggestion = predictNextWorkoutName(await loadSplitNames(uid), history);

  return suggestion ? { suggestion } : {};
}
