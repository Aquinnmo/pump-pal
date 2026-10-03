import type { PerformedSet, Workout } from "@/types/workout";
import { toDateObj } from "@/lib/workout-conversion";

export const SET_CONSISTENCY_WORKOUT_LIMIT = 30;
export const SET_CONSISTENCY_MIN_ENTRIES = 6;
export const SET_CONSISTENCY_STABLE_SHARE = 0.8;

// Weight and reps need different edges: dropping a rep or two per set is normal
// fatigue, dropping 25% of the bar is a decision.
export const SET_CONSISTENCY_WEIGHT_EDGES = { minor: 0.1, major: 0.25 };
export const SET_CONSISTENCY_REP_EDGES = { minor: 0.3, major: 0.6 };

/** One label per set-to-set change within an exercise. */
export type SetChangeBucket =
  | "bigDrop"
  | "minorDrop"
  | "held"
  | "minorSpike"
  | "bigSpike";

/** The five signed buckets, in graph order. */
export const SET_CHANGE_BUCKET_ORDER: SetChangeBucket[] = [
  "bigDrop",
  "minorDrop",
  "held",
  "minorSpike",
  "bigSpike",
];

export type SetConsistencyResult = {
  /** The verdict, one of the five buckets; null until there is enough data. */
  category: SetChangeBucket | null;
  analyzedWorkouts: number;
  /** Set-to-set changes counted, across all multi-set exercises. */
  eligibleEntries: number;
  distribution: Record<SetChangeBucket, number>;
};

function finitePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Signed change, normalized against the smaller value so it is symmetric. */
function relativeChange(previous: number, current: number): number {
  return (current - previous) / Math.min(previous, current);
}

function bucketFor(
  change: number,
  { minor, major }: { minor: number; major: number },
): SetChangeBucket {
  if (change <= -major) return "bigDrop";
  if (change <= -minor) return "minorDrop";
  if (change < minor) return "held";
  if (change < major) return "minorSpike";
  return "bigSpike";
}

/**
 * Classifies the change from one set to the next.
 *
 * Weight is the signal; reps only decide when the weight did not move (bodyweight
 * work, or straight sets where only the reps faded). The two are NOT combined:
 * weight and reps are negatively coupled by design — a heavier set buys fewer
 * reps — so treating a rep drop as evidence of decline turns every textbook
 * pyramid into a wall of drops.
 */
function classifyDelta(
  previous: PerformedSet,
  current: PerformedSet,
): SetChangeBucket | null {
  const previousWeight = previous.bodyweight
    ? null
    : finitePositive(previous.weight);
  const currentWeight = current.bodyweight
    ? null
    : finitePositive(current.weight);
  const weightComparable = previousWeight != null && currentWeight != null;
  if (weightComparable && previousWeight !== currentWeight) {
    return bucketFor(
      relativeChange(previousWeight, currentWeight),
      SET_CONSISTENCY_WEIGHT_EDGES,
    );
  }

  const previousReps = finitePositive(previous.reps);
  const currentReps = finitePositive(current.reps);
  if (previousReps != null && currentReps != null) {
    return bucketFor(
      relativeChange(previousReps, currentReps),
      SET_CONSISTENCY_REP_EDGES,
    );
  }
  // Weight was logged and never budged, with no reps to fall back on.
  return weightComparable ? "held" : null;
}

// Held wins outright when most changes were flat; otherwise the most common
// kind of move decides. ponytail: ties go to the earlier bucket in graph order.
function categoryFor(
  distribution: Record<SetChangeBucket, number>,
  eligibleEntries: number,
): SetChangeBucket | null {
  if (eligibleEntries < SET_CONSISTENCY_MIN_ENTRIES) return null;
  if (distribution.held / eligibleEntries >= SET_CONSISTENCY_STABLE_SHARE) {
    return "held";
  }
  return (["bigDrop", "minorDrop", "minorSpike", "bigSpike"] as const).reduce(
    (best, bucket) => (distribution[bucket] > distribution[best] ? bucket : best),
  );
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

  const distribution: Record<SetChangeBucket, number> = {
    bigDrop: 0,
    minorDrop: 0,
    held: 0,
    minorSpike: 0,
    bigSpike: 0,
  };

  recentWorkouts.forEach(({ workout }) => {
    (workout.performedExercises ?? []).forEach((exercise) => {
      // A drop set's drops share its setNumber and are a planned weight cut, not a
      // lapse in consistency — compare only the first part of each set.
      const orderedSets = [...(exercise.sets ?? [])]
        .sort((left, right) => left.setNumber - right.setNumber)
        .filter((set, index, all) => index === 0 || all[index - 1].setNumber !== set.setNumber);
      for (let index = 1; index < orderedSets.length; index += 1) {
        const bucket = classifyDelta(orderedSets[index - 1], orderedSets[index]);
        if (bucket) distribution[bucket] += 1;
      }
    });
  });

  const eligibleEntries = Object.values(distribution).reduce(
    (total, count) => total + count,
    0,
  );
  return {
    category: categoryFor(distribution, eligibleEntries),
    analyzedWorkouts: recentWorkouts.length,
    eligibleEntries,
    distribution,
  };
}
