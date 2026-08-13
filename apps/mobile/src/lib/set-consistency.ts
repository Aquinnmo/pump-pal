import type { PerformedSet, Workout } from "@/types/workout";
import { toDateObj } from "@/lib/workout-conversion";

export const SET_CONSISTENCY_WORKOUT_LIMIT = 30;
export const SET_CONSISTENCY_MIN_ENTRIES = 3;
export const SET_CONSISTENCY_WEIGHT_THRESHOLD = 0.1;
export const SET_CONSISTENCY_REP_THRESHOLD = 0.2;
export const SET_CONSISTENCY_STABLE_SHARE = 0.8;
export const SET_CONSISTENCY_ERRATIC_SHARE = 0.2;

export type SetConsistencyCategory =
  | "consistent"
  | "overconfident"
  | "underconfident"
  | "erratic";

export type SetConsistencyEntryCategory =
  | "stable"
  | "upward"
  | "downward"
  | "mixed";

export type SetConsistencyResult = {
  category: SetConsistencyCategory | null;
  analyzedWorkouts: number;
  eligibleEntries: number;
  entries: Record<SetConsistencyEntryCategory, number>;
};

type Direction = {
  comparable: boolean;
  upward: boolean;
  downward: boolean;
};

function finitePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function metricDirection(
  sets: PerformedSet[],
  threshold: number,
  valueFor: (set: PerformedSet) => number | null,
): Direction {
  let comparable = false;
  let upward = false;
  let downward = false;

  for (let index = 1; index < sets.length; index += 1) {
    const previous = valueFor(sets[index - 1]);
    const current = valueFor(sets[index]);
    if (previous == null || current == null) continue;

    comparable = true;
    const relativeDifference =
      Math.abs(current - previous) / Math.min(current, previous);
    if (relativeDifference < threshold) continue;
    if (current > previous) upward = true;
    if (current < previous) downward = true;
  }

  return { comparable, upward, downward };
}

function classifyEntry(sets: PerformedSet[]): SetConsistencyEntryCategory | null {
  const orderedSets = [...sets].sort(
    (left, right) => left.setNumber - right.setNumber,
  );
  const weight = metricDirection(
    orderedSets,
    SET_CONSISTENCY_WEIGHT_THRESHOLD,
    (set) => (set.bodyweight ? null : finitePositive(set.weight)),
  );
  const reps = metricDirection(
    orderedSets,
    SET_CONSISTENCY_REP_THRESHOLD,
    (set) => finitePositive(set.reps),
  );

  if (!weight.comparable && !reps.comparable) return null;

  const upward = weight.upward || reps.upward;
  const downward = weight.downward || reps.downward;
  if (upward && downward) return "mixed";
  if (upward) return "upward";
  if (downward) return "downward";
  return "stable";
}

function categoryFor(
  entries: Record<SetConsistencyEntryCategory, number>,
  eligibleEntries: number,
): SetConsistencyCategory | null {
  if (eligibleEntries < SET_CONSISTENCY_MIN_ENTRIES) return null;
  if (entries.stable / eligibleEntries >= SET_CONSISTENCY_STABLE_SHARE) {
    return "consistent";
  }

  const upwardEvidence = entries.upward + entries.mixed;
  const downwardEvidence = entries.downward + entries.mixed;
  if (
    upwardEvidence / eligibleEntries >= SET_CONSISTENCY_ERRATIC_SHARE &&
    downwardEvidence / eligibleEntries >= SET_CONSISTENCY_ERRATIC_SHARE
  ) {
    return "erratic";
  }
  if (downwardEvidence > upwardEvidence) return "overconfident";
  if (upwardEvidence > downwardEvidence) return "underconfident";
  return "erratic";
}

export function analyzeSetConsistency(
  workouts: Workout[],
): SetConsistencyResult {
  const recentWorkouts = workouts
    .map((workout) => ({ workout, date: toDateObj(workout.date) }))
    .filter(
      (entry): entry is { workout: Workout; date: Date } => entry.date != null,
    )
    .sort(
      (left, right) =>
        right.date.getTime() - left.date.getTime() ||
        left.workout.id.localeCompare(right.workout.id),
    )
    .slice(0, SET_CONSISTENCY_WORKOUT_LIMIT);

  const entries: Record<SetConsistencyEntryCategory, number> = {
    stable: 0,
    upward: 0,
    downward: 0,
    mixed: 0,
  };

  recentWorkouts.forEach(({ workout }) => {
    (workout.performedExercises ?? []).forEach((exercise) => {
      const entry = classifyEntry(exercise.sets ?? []);
      if (entry) entries[entry] += 1;
    });
  });

  const eligibleEntries = Object.values(entries).reduce(
    (total, count) => total + count,
    0,
  );
  return {
    category: categoryFor(entries, eligibleEntries),
    analyzedWorkouts: recentWorkouts.length,
    eligibleEntries,
    entries,
  };
}
