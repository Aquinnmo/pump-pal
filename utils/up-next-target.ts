import { workoutRepository } from '@/db/workout-repository';
import { Workout } from '@/types/workout';
import { predictNextWorkoutName } from '@/utils/predict-next-workout';
import { loadSplitNames } from '@/utils/split-names';

// Resolves what "Up next" actually points at, from scratch. The widget's and the
// watch's cached copy can be stale, so both the pumppal://up-next landing screen and
// the watch's headless action task re-resolve here — same priority chain as the Home
// screen's Up Next card: live workout, then head of the planned queue, then the
// split's predicted next day.
export async function resolveUpNextTarget(uid: string): Promise<{ id?: string; suggestion?: string }> {
  const inProgress = await workoutRepository.getByStatus(uid, 'in_progress');
  if (inProgress[0]) return { id: inProgress[0].id };

  const planned = await workoutRepository.getByStatus(uid, 'planned');
  const nextPlan = [...planned].sort((a, b) => (a.data.queueOrder ?? Infinity) - (b.data.queueOrder ?? Infinity))[0];
  if (nextPlan) return { id: nextPlan.id };

  const history = (await workoutRepository.getHistory(uid))
    .map((record) => record.data)
    .slice(0, 30) as Workout[];
  const suggestion = predictNextWorkoutName(await loadSplitNames(uid), history);

  return suggestion ? { suggestion } : {};
}
