import { Workout } from '@/types/workout';
import { toDateObj } from '@/utils/workout-conversion';

// Predicts the next workout name from the single most recent time the last-done
// workout type was performed, falling back to round-robin through splitNames when
// there's no prior occurrence to learn from.
export function predictWorkoutAfterName(
  splitNames: string[],
  history: Workout[],
  afterWorkoutName?: string | null
): string | null {
  if (splitNames.length === 0) return null;
  if (splitNames.length === 1) return splitNames[0];

  const splitHistory = history
    .filter((w) => (!w.status || w.status === 'completed') && splitNames.includes(w.name))
    .sort((a, b) => toDateObj(a.date).getTime() - toDateObj(b.date).getTime());

  const anchorName = afterWorkoutName ?? splitHistory[splitHistory.length - 1]?.name;
  if (!anchorName) return splitNames[0];

  // Find the most recent earlier time this workout type was done, and what followed it
  for (let i = splitHistory.length - 2; i >= 0; i--) {
    if (splitHistory[i].name !== anchorName) continue;
    const followedBy = splitHistory[i + 1].name;
    if (followedBy === anchorName) continue; // back-to-back, no signal
    return followedBy;
  }

  // No prior transition signal — fall back to round-robin through the split order
  const lastIdx = splitNames.indexOf(anchorName);
  if (lastIdx === -1) return splitNames[0];
  return splitNames[(lastIdx + 1) % splitNames.length];
}

export function predictNextWorkoutName(splitNames: string[], history: Workout[]): string | null {
  return predictWorkoutAfterName(splitNames, history);
}
