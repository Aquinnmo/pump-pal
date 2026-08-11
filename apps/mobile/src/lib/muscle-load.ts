import { isMuscleId, MUSCLES, type MuscleId } from '@/constants/muscles';
import type { CatalogExercise, PerformedExercise, PerformedSet, Workout } from '@/types/workout';
import { exerciseLabel, toDateObj } from '@/lib/workout-conversion';
import { muscleMapColor } from '@/lib/muscle-map-scale';

export type MuscleLoadMetric = 'weight_reps' | 'reps' | 'duration' | 'distance' | 'calories';

export interface MuscleLoadContributor {
  exerciseId: string;
  variationId: string | null;
  label: string;
  score: number;
}

export interface MuscleLoadStat {
  muscle: MuscleId;
  score: number;
  lastWorkedAt: number | null;
  contributors: MuscleLoadContributor[];
}

export interface MuscleLoadCoverage {
  recentExercises: number;
  recentSets: number;
  matchedExercises: number;
  matchedSets: number;
  unmatchedExercises: number;
  unmatchedSets: number;
}

export interface MuscleLoadResult {
  catalogAvailable: boolean;
  windowDays: number;
  halfLifeDays: number;
  saturationScore: number;
  muscles: MuscleLoadStat[];
  coverage: MuscleLoadCoverage;
}

interface MuscleMapping {
  primary: MuscleId[];
  secondary: MuscleId[];
}

interface SetLoad {
  metric: MuscleLoadMetric;
  value: number;
}

interface RecentExercise {
  performed: PerformedExercise;
  mapping: MuscleMapping | null;
  workoutTime: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MUSCLE_LOAD_WINDOW_DAYS = 7;
export const MUSCLE_LOAD_HALF_LIFE_DAYS = 2;
export const MUSCLE_LOAD_SATURATION_SCORE = 8;
const PRIMARY_WEIGHT = 1;
const SECONDARY_WEIGHT = 0.5;

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Select exactly one comparable workload metric for a recorded set. */
export function setLoad(set: PerformedSet): SetLoad | null {
  const reps = positive(set.reps);
  const weight = positive(set.weight);
  if (reps != null && weight != null) return { metric: 'weight_reps', value: reps * weight };
  if (reps != null) return { metric: 'reps', value: reps };

  const duration = positive(set.durationSeconds);
  if (duration != null) return { metric: 'duration', value: duration };
  const distance = positive(set.distance);
  if (distance != null) return { metric: 'distance', value: distance };
  const calories = positive(set.calories);
  if (calories != null) return { metric: 'calories', value: calories };
  return null;
}

function mappingKey(exerciseId: string, variationId: string | null): string {
  return `${exerciseId}::${variationId ?? '$parent'}`;
}

function baselineKey(exerciseId: string, variationId: string | null, metric: MuscleLoadMetric): string {
  return `${mappingKey(exerciseId, variationId)}::${metric}`;
}

function contributorKey(exerciseId: string, variationId: string | null, label: string): string {
  return `${mappingKey(exerciseId, variationId)}::${label}`;
}

function makeMapping(primary: readonly string[], secondary: readonly string[]): MuscleMapping {
  return {
    primary: primary.filter(isMuscleId),
    secondary: secondary.filter(isMuscleId),
  };
}

function buildMappings(catalog: CatalogExercise[]): Map<string, MuscleMapping> {
  const mappings = new Map<string, MuscleMapping>();
  for (const exercise of catalog) {
    if (exercise.status === 'pending_review') continue;
    mappings.set(
      mappingKey(exercise.id, null),
      makeMapping(exercise.primaryMuscles ?? [], exercise.secondaryMuscles ?? [])
    );
    for (const variation of exercise.variations ?? []) {
      mappings.set(
        mappingKey(exercise.id, variation.id),
        makeMapping(variation.primaryMuscles ?? [], variation.secondaryMuscles ?? [])
      );
    }
  }
  return mappings;
}

/**
 * Deterministically calculates recent muscle load. It performs exact catalog
 * joins and contains no model, prompt, cache, or quota path.
 */
export function computeMuscleLoad(
  workouts: Workout[],
  catalog: CatalogExercise[],
  now: number | Date = Date.now()
): MuscleLoadResult {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const catalogAvailable = catalog.length > 0;
  const mappings = buildMappings(catalog);
  const baselines = new Map<string, number>();

  for (const workout of workouts) {
    const workoutTime = toDateObj(workout.date)?.getTime();
    if (workoutTime === undefined) continue;
    if (!Number.isFinite(workoutTime) || workoutTime > nowMs) continue;
    for (const performed of workout.performedExercises ?? []) {
      if (!mappings.has(mappingKey(performed.exerciseId, performed.variationId))) continue;
      for (const set of performed.sets ?? []) {
        const load = setLoad(set);
        if (!load) continue;
        const key = baselineKey(performed.exerciseId, performed.variationId, load.metric);
        baselines.set(key, Math.max(baselines.get(key) ?? 0, load.value));
      }
    }
  }

  const cutoff = nowMs - MUSCLE_LOAD_WINDOW_DAYS * DAY_MS;
  const recent: RecentExercise[] = [];
  for (const workout of workouts) {
    const workoutTime = toDateObj(workout.date)?.getTime();
    if (workoutTime === undefined) continue;
    if (!Number.isFinite(workoutTime) || workoutTime < cutoff || workoutTime > nowMs) continue;
    for (const performed of workout.performedExercises ?? []) {
      recent.push({
        performed,
        mapping: mappings.get(mappingKey(performed.exerciseId, performed.variationId)) ?? null,
        workoutTime,
      });
    }
  }

  const coverage: MuscleLoadCoverage = {
    recentExercises: recent.length,
    recentSets: 0,
    matchedExercises: 0,
    matchedSets: 0,
    unmatchedExercises: 0,
    unmatchedSets: 0,
  };

  interface Accumulator {
    score: number;
    lastWorkedAt: number | null;
    contributors: Map<string, MuscleLoadContributor>;
  }
  const accumulators = new Map<MuscleId, Accumulator>();
  const bucket = (muscle: MuscleId): Accumulator => {
    let value = accumulators.get(muscle);
    if (!value) {
      value = { score: 0, lastWorkedAt: null, contributors: new Map() };
      accumulators.set(muscle, value);
    }
    return value;
  };

  for (const item of recent) {
    const sets = item.performed.sets ?? [];
    coverage.recentSets += sets.length;
    if (!item.mapping || (item.mapping.primary.length === 0 && item.mapping.secondary.length === 0)) {
      coverage.unmatchedExercises += 1;
      coverage.unmatchedSets += sets.length;
      continue;
    }

    coverage.matchedExercises += 1;
    coverage.matchedSets += sets.length;
    const ageDays = (nowMs - item.workoutTime) / DAY_MS;
    const recency = 2 ** (-ageDays / MUSCLE_LOAD_HALF_LIFE_DAYS);
    const label = exerciseLabel(item.performed).trim() || item.performed.exerciseId;

    for (const set of sets) {
      const load = setLoad(set);
      if (!load) continue;
      const best = baselines.get(
        baselineKey(item.performed.exerciseId, item.performed.variationId, load.metric)
      );
      if (!best) continue;
      const normalized = Math.min(load.value / best, 1);

      const apply = (muscle: MuscleId, allocation: number) => {
        const contribution = normalized * recency * allocation;
        const accumulator = bucket(muscle);
        accumulator.score += contribution;
        accumulator.lastWorkedAt = Math.max(accumulator.lastWorkedAt ?? 0, item.workoutTime);
        const key = contributorKey(
          item.performed.exerciseId,
          item.performed.variationId,
          label
        );
        const existing = accumulator.contributors.get(key);
        if (existing) {
          existing.score += contribution;
        } else {
          accumulator.contributors.set(key, {
            exerciseId: item.performed.exerciseId,
            variationId: item.performed.variationId,
            label,
            score: contribution,
          });
        }
      };

      item.mapping.primary.forEach((muscle) => apply(muscle, PRIMARY_WEIGHT));
      item.mapping.secondary.forEach((muscle) => apply(muscle, SECONDARY_WEIGHT));
    }
  }

  const muscles = MUSCLES.map((muscle): MuscleLoadStat => {
    const accumulator = accumulators.get(muscle);
    if (!accumulator) return { muscle, score: 0, lastWorkedAt: null, contributors: [] };
    return {
      muscle,
      score: accumulator.score,
      lastWorkedAt: accumulator.lastWorkedAt,
      contributors: [...accumulator.contributors.values()].sort(
        (left, right) =>
          right.score - left.score || (left.label < right.label ? -1 : left.label > right.label ? 1 : 0)
      ),
    };
  });

  return {
    catalogAvailable,
    windowDays: MUSCLE_LOAD_WINDOW_DAYS,
    halfLifeDays: MUSCLE_LOAD_HALF_LIFE_DAYS,
    saturationScore: MUSCLE_LOAD_SATURATION_SCORE,
    muscles,
    coverage,
  };
}

/** Fixed absolute scale used to color the shared recent-load map. */
export function muscleLoadColor(score: number): string {
  return muscleMapColor(muscleLoadPercentage(score));
}

/**
 * Converts an internal recent-load score to the fixed user-facing scale.
 * This is a workload indicator, not a recovery or biological-fatigue score.
 */
export function muscleLoadPercentage(score: number): number {
  return Math.round(
    Math.min(Math.max(score / MUSCLE_LOAD_SATURATION_SCORE, 0), 1) * 100
  );
}
