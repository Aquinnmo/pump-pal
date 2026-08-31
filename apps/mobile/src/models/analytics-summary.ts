import {
  exerciseLabel,
  isDurationExercise,
  toDateObj,
} from '@/models/workout-conversion';
import type { Workout } from '@/types/workout';

type StrengthHistoryPoint = {
  dateLabel: string;
  timestamp: number;
  estimatedOneRepMax: number;
};

export function computeAnalyticsSummary(workouts: Workout[]) {
  if (workouts.length === 0) {
    return {
      favoriteExercise: null as string | null,
      favoriteWorkoutType: null as string | null,
      maxWeights: {} as Record<string, number>,
      maxReps: {} as Record<string, number>,
      maxDuration: {} as Record<string, number>,
      weightedExercises: [] as string[],
      bodyweightExerciseList: [] as string[],
      durationExerciseList: [] as string[],
      heaviestLift: null as { exercise: string; weight: number } | null,
      strengthHistories: {} as Record<string, StrengthHistoryPoint[]>,
      eligibleStrengthExercises: [] as string[],
    };
  }

  const counts: Record<string, number> = {};
  const maxW: Record<string, number> = {};
  const maxR: Record<string, number> = {};
  const maxD: Record<string, number> = {};
  const strengthHistoryByDay: Record<
    string,
    Record<string, StrengthHistoryPoint>
  > = {};
  const bodyweightExerciseSet = new Set<string>();
  const durationExerciseSet = new Set<string>();
  let heaviest: { exercise: string; weight: number } | null = null;
  const workoutTypeCounts: Record<string, number> = {};
  const workoutTypeLastDate: Record<string, number> = {};

  workouts.forEach((workout) => {
    const date = toDateObj(workout.date);
    if (!date) return;
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    const dayKey = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

    if (workout.name) {
      workoutTypeCounts[workout.name] =
        (workoutTypeCounts[workout.name] || 0) + 1;
      workoutTypeLastDate[workout.name] = date.getTime();
    }

    (workout.performedExercises ?? []).forEach((performedExercise) => {
      const name = exerciseLabel(performedExercise).trim();
      if (!name) return;

      counts[name] = (counts[name] || 0) + 1;
      if (performedExercise.sets.some((set) => set.bodyweight))
        bodyweightExerciseSet.add(name);
      if (isDurationExercise(performedExercise))
        durationExerciseSet.add(name);

      performedExercise.sets.forEach((set) => {
        const isDuration =
          set.durationSeconds !== undefined && set.reps === undefined;

        if (isDuration) {
          maxD[name] = Math.max(maxD[name] || 0, set.durationSeconds ?? 0);
        } else {
          maxW[name] = Math.max(maxW[name] || 0, set.weight ?? 0);
          if (set.bodyweight)
            maxR[name] = Math.max(maxR[name] || 0, set.reps ?? 0);
          if (
            !set.bodyweight &&
            (set.weight ?? 0) > 0 &&
            (!heaviest || (set.weight ?? 0) > heaviest.weight)
          ) {
            heaviest = { exercise: name, weight: set.weight ?? 0 };
          }
        }

        const weight = set.weight ?? 0;
        const reps = set.reps ?? 0;
        const isValidWeightedSet =
          !isDuration &&
          !set.bodyweight &&
          Number.isFinite(weight) &&
          Number.isFinite(reps) &&
          weight > 0 &&
          reps > 0;
        if (!isValidWeightedSet) return;

        const estimatedOneRepMax = weight * (1 + reps / 30);
        if (!strengthHistoryByDay[name]) strengthHistoryByDay[name] = {};
        const existingDay = strengthHistoryByDay[name][dayKey];
        if (
          !existingDay ||
          estimatedOneRepMax > existingDay.estimatedOneRepMax
        ) {
          strengthHistoryByDay[name][dayKey] = {
            dateLabel,
            timestamp: date.getTime(),
            estimatedOneRepMax,
          };
        }
      });
    });
  });

  let favorite: string | null = null;
  let maxCount = 0;
  Object.entries(counts).forEach(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      favorite = name;
    }
  });

  let favoriteType: string | null = null;
  let maxTypeCount = 0;
  let maxTypeDate = 0;
  Object.entries(workoutTypeCounts).forEach(([name, count]) => {
    const lastDate = workoutTypeLastDate[name] || 0;
    if (
      count > maxTypeCount ||
      (count === maxTypeCount && lastDate > maxTypeDate)
    ) {
      maxTypeCount = count;
      maxTypeDate = lastDate;
      favoriteType = name;
    }
  });

  const allExerciseNames = Object.keys(counts).sort();
  const weighted = allExerciseNames.filter(
    (name) =>
      !bodyweightExerciseSet.has(name) && !durationExerciseSet.has(name),
  );
  const bodyweight = allExerciseNames.filter((name) =>
    bodyweightExerciseSet.has(name),
  );
  const duration = allExerciseNames.filter((name) =>
    durationExerciseSet.has(name),
  );
  const strengthHistories = Object.fromEntries(
    Object.entries(strengthHistoryByDay).map(([name, historyByDay]) => [
      name,
      Object.values(historyByDay).sort((a, b) => a.timestamp - b.timestamp),
    ]),
  ) as Record<string, StrengthHistoryPoint[]>;
  const eligibleStrengthExercises = Object.keys(strengthHistories)
    .filter((name) => strengthHistories[name].length >= 2)
    .sort();

  return {
    favoriteExercise: favorite,
    favoriteWorkoutType: favoriteType,
    maxWeights: maxW,
    maxReps: maxR,
    maxDuration: maxD,
    weightedExercises: weighted,
    bodyweightExerciseList: bodyweight,
    durationExerciseList: duration,
    heaviestLift: heaviest,
    strengthHistories,
    eligibleStrengthExercises,
  };
}

export type AnalyticsSummary = ReturnType<typeof computeAnalyticsSummary>;
