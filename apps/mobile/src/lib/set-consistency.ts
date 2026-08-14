import type { PerformedSet, Workout } from "@/types/workout";
import { toDateObj } from "@/lib/workout-conversion";

export const SET_CONSISTENCY_WORKOUT_LIMIT = 30;
export const SET_CONSISTENCY_MIN_ENTRIES = 3;
export const SET_CONSISTENCY_STABLE_SHARE = 0.8;
export const SET_CONSISTENCY_ERRATIC_SHARE = 0.2;

// Weight and reps need different edges: dropping a rep or two per set is normal
// fatigue, dropping 25% of the bar is a decision.
export const SET_CONSISTENCY_WEIGHT_EDGES = { minor: 0.1, major: 0.25 };
export const SET_CONSISTENCY_REP_EDGES = { minor: 0.3, major: 0.6 };

export type SetConsistencyCategory =
  | "consistent"
  | "overconfident"
  | "underconfident"
  | "erratic";

/** One label per exercise: how its sets drifted from first to last. */
export type SetChangeBucket =
  | "bigDrop"
  | "minorDrop"
  | "held"
  | "minorSpike"
  | "bigSpike"
  | "erratic";

/** The five signed buckets, in graph order. `erratic` is off this axis. */
export const SET_CHANGE_BUCKET_ORDER: SetChangeBucket[] = [
  "bigDrop",
  "minorDrop",
  "held",
  "minorSpike",
  "bigSpike",
];

export type SetConsistencyResult = {
  category: SetConsistencyCategory | null;
  analyzedWorkouts: number;
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

function seriesOf(
  sets: PerformedSet[],
  valueFor: (set: PerformedSet) => number | null,
): number[] {
  const values: number[] = [];
  sets.forEach((set) => {
    const value = valueFor(set);
    if (value != null) values.push(value);
  });
  return values;
}

/**
 * Classifies one exercise by how its sets drifted.
 *
 * Weight is the signal; reps only decide when the weight never moves (bodyweight
 * work, or straight sets where only the reps faded). The two are NOT combined:
 * weight and reps are negatively coupled by design — a heavier set buys fewer
 * reps — so treating a rep drop as evidence of decline turns every textbook
 * pyramid into "erratic".
 *
 * Direction comes from the net first-to-last change, so a gradual ramp where no
 * single step is large still registers. `erratic` is reserved for an exercise
 * that moved significantly in both directions.
 */
function classifyExercise(sets: PerformedSet[]): SetChangeBucket | null {
  const orderedSets = [...sets].sort(
    (left, right) => left.setNumber - right.setNumber,
  );

  const weights = seriesOf(orderedSets, (set) =>
    set.bodyweight ? null : finitePositive(set.weight),
  );
  const reps = seriesOf(orderedSets, (set) => finitePositive(set.reps));

  const weightComparable = weights.length > 1;
  const repsComparable = reps.length > 1;
  if (!weightComparable && !repsComparable) return null;

  const useWeight = weightComparable && new Set(weights).size > 1;
  // Weight was logged and never budged, with no reps to fall back on.
  if (!useWeight && !repsComparable) return "held";

  const values = useWeight ? weights : reps;
  const { minor, major } = useWeight
    ? SET_CONSISTENCY_WEIGHT_EDGES
    : SET_CONSISTENCY_REP_EDGES;

  let rose = false;
  let fell = false;
  for (let index = 1; index < values.length; index += 1) {
    const change = relativeChange(values[index - 1], values[index]);
    if (change >= minor) rose = true;
    if (change <= -minor) fell = true;
  }
  if (rose && fell) return "erratic";

  const net = relativeChange(values[0], values[values.length - 1]);
  if (net <= -major) return "bigDrop";
  if (net <= -minor) return "minorDrop";
  if (net < minor) return "held";
  if (net < major) return "minorSpike";
  return "bigSpike";
}

function categoryFor(
  distribution: Record<SetChangeBucket, number>,
  eligibleEntries: number,
): SetConsistencyCategory | null {
  if (eligibleEntries < SET_CONSISTENCY_MIN_ENTRIES) return null;
  if (distribution.held / eligibleEntries >= SET_CONSISTENCY_STABLE_SHARE) {
    return "consistent";
  }

  // An erratic exercise went both ways, so it counts as evidence on both sides.
  const downEvidence =
    distribution.bigDrop + distribution.minorDrop + distribution.erratic;
  const upEvidence =
    distribution.bigSpike + distribution.minorSpike + distribution.erratic;
  if (
    downEvidence / eligibleEntries >= SET_CONSISTENCY_ERRATIC_SHARE &&
    upEvidence / eligibleEntries >= SET_CONSISTENCY_ERRATIC_SHARE
  ) {
    return "erratic";
  }
  if (downEvidence > upEvidence) return "overconfident";
  if (upEvidence > downEvidence) return "underconfident";
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

  const distribution: Record<SetChangeBucket, number> = {
    bigDrop: 0,
    minorDrop: 0,
    held: 0,
    minorSpike: 0,
    bigSpike: 0,
    erratic: 0,
  };

  recentWorkouts.forEach(({ workout }) => {
    (workout.performedExercises ?? []).forEach((exercise) => {
      const bucket = classifyExercise(exercise.sets ?? []);
      if (bucket) distribution[bucket] += 1;
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
