import { isMuscleId, MUSCLES, type MuscleId } from '@/constants/muscles';
import type { CatalogExercise, PerformedExercise, PerformedSet, Workout } from '@/types/workout';
import { exerciseLabel, toDateObj } from '@/lib/workout-conversion';

export type MuscleDevelopmentMetric = 'estimated_1rm' | 'reps' | 'duration' | 'distance' | 'calories';
export type DevelopmentGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface MuscleDevelopmentContributor {
  exerciseId: string;
  variationId: string | null;
  label: string;
  metric: MuscleDevelopmentMetric;
  previousBest: number;
  recentBest: number;
  change: number;
  allocation: number;
}

export interface MuscleDevelopmentStat {
  muscle: MuscleId;
  /** Percentage change in the geometric mean of comparable performance signals. */
  change: number | null;
  /** Relative 0–100 score, with unchanged performance anchored at 50. */
  score: number | null;
  contributors: MuscleDevelopmentContributor[];
}

export interface MuscleDevelopmentCoverage {
  previousExercises: number;
  recentExercises: number;
  previousSets: number;
  recentSets: number;
  matchedExercises: number;
  unmatchedExercises: number;
  comparableSignals: number;
}

export interface MuscleDevelopmentResult {
  catalogAvailable: boolean;
  windowDays: number;
  recentWindowStart: number;
  previousWindowStart: number;
  now: number;
  muscles: MuscleDevelopmentStat[];
  coverage: MuscleDevelopmentCoverage;
}

interface MuscleMapping {
  primary: MuscleId[];
  secondary: MuscleId[];
}

interface PerformanceSignal {
  metric: MuscleDevelopmentMetric;
  value: number;
}

interface ComparableSignal {
  exerciseId: string;
  variationId: string | null;
  label: string;
  metric: MuscleDevelopmentMetric;
  previousBest: number;
  recentBest: number;
  mapping: MuscleMapping;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MUSCLE_DEVELOPMENT_WINDOW_DAYS = 90;
const PRIMARY_WEIGHT = 1;
const SECONDARY_WEIGHT = 0.5;

/** Converts the internal relative score to a user-facing development grade. */
export function developmentGrade(score: number): DevelopmentGrade {
  const bounded = Math.min(Math.max(score, 0), 100);
  if (bounded >= 90) return 'A+';
  if (bounded >= 80) return 'A';
  if (bounded >= 70) return 'B';
  if (bounded >= 50) return 'C';
  if (bounded >= 30) return 'D';
  return 'F';
}

export function topDevelopmentContributors(
  contributors: readonly MuscleDevelopmentContributor[],
  limit = 3,
): MuscleDevelopmentContributor[] {
  const count = Math.max(0, Math.floor(limit));
  return [...contributors]
    .sort((left, right) => {
      const magnitudeDifference =
        Math.abs(right.change * right.allocation) -
        Math.abs(left.change * left.allocation);
      if (magnitudeDifference !== 0) return magnitudeDifference;

      return (
        left.label.localeCompare(right.label) ||
        left.exerciseId.localeCompare(right.exerciseId) ||
        (left.variationId ?? '').localeCompare(right.variationId ?? '') ||
        left.metric.localeCompare(right.metric)
      );
    })
    .slice(0, count);
}

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Select exactly one performance metric so incompatible logging modes never mix. */
export function setPerformance(set: PerformedSet): PerformanceSignal | null {
  const reps = positive(set.reps);
  const weight = positive(set.weight);
  if (!set.bodyweight && reps != null && weight != null) {
    return { metric: 'estimated_1rm', value: weight * (1 + reps / 30) };
  }
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

function signalKey(
  exerciseId: string,
  variationId: string | null,
  metric: MuscleDevelopmentMetric,
): string {
  return `${mappingKey(exerciseId, variationId)}::${metric}`;
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
    mappings.set(mappingKey(exercise.id, null), makeMapping(exercise.primaryMuscles ?? [], exercise.secondaryMuscles ?? []));
    for (const variation of exercise.variations ?? []) {
      mappings.set(mappingKey(exercise.id, variation.id), makeMapping(variation.primaryMuscles ?? [], variation.secondaryMuscles ?? []));
    }
  }
  return mappings;
}

function windowBestSignals(
  workouts: Workout[],
  mappings: Map<string, MuscleMapping>,
  start: number,
  end: number,
  coverage: MuscleDevelopmentCoverage,
  period: 'previous' | 'recent',
): Map<string, { value: number; performed: PerformedExercise; mapping: MuscleMapping }> {
  const signals = new Map<string, { value: number; performed: PerformedExercise; mapping: MuscleMapping }>();

  for (const workout of workouts) {
    const workoutTime = toDateObj(workout.date)?.getTime();
    if (workoutTime === undefined) continue;
    const outsideWindow = period === 'previous'
      ? workoutTime < start || workoutTime >= end
      : workoutTime < start || workoutTime > end;
    if (!Number.isFinite(workoutTime) || outsideWindow) continue;
    for (const performed of workout.performedExercises ?? []) {
      coverage[period === 'previous' ? 'previousExercises' : 'recentExercises'] += 1;
      const mapping = mappings.get(mappingKey(performed.exerciseId, performed.variationId));
      if (!mapping || (mapping.primary.length === 0 && mapping.secondary.length === 0)) {
        coverage.unmatchedExercises += 1;
        continue;
      }
      coverage.matchedExercises += 1;
      for (const set of performed.sets ?? []) {
        coverage[period === 'previous' ? 'previousSets' : 'recentSets'] += 1;
        const signal = setPerformance(set);
        if (!signal) continue;
        const key = signalKey(performed.exerciseId, performed.variationId, signal.metric);
        const existing = signals.get(key);
        if (!existing || signal.value > existing.value) {
          signals.set(key, { value: signal.value, performed, mapping });
        }
      }
    }
  }
  return signals;
}

/**
 * Compares an athlete's last 90 days with the preceding 90 days. Comparisons
 * are strictly within the same catalog exercise, variation, and metric.
 */
export function computeMuscleDevelopment(
  workouts: Workout[],
  catalog: CatalogExercise[],
  now: number | Date = Date.now(),
): MuscleDevelopmentResult {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const recentWindowStart = nowMs - MUSCLE_DEVELOPMENT_WINDOW_DAYS * DAY_MS;
  const previousWindowStart = recentWindowStart - MUSCLE_DEVELOPMENT_WINDOW_DAYS * DAY_MS;
  const coverage: MuscleDevelopmentCoverage = {
    previousExercises: 0,
    recentExercises: 0,
    previousSets: 0,
    recentSets: 0,
    matchedExercises: 0,
    unmatchedExercises: 0,
    comparableSignals: 0,
  };
  const mappings = buildMappings(catalog);
  const previous = windowBestSignals(workouts, mappings, previousWindowStart, recentWindowStart, coverage, 'previous');
  const recent = windowBestSignals(workouts, mappings, recentWindowStart, nowMs, coverage, 'recent');
  const comparable: ComparableSignal[] = [];

  for (const [key, previousSignal] of previous) {
    const recentSignal = recent.get(key);
    if (!recentSignal) continue;
    const metric = key.slice(key.lastIndexOf('::') + 2) as MuscleDevelopmentMetric;
    comparable.push({
      exerciseId: previousSignal.performed.exerciseId,
      variationId: previousSignal.performed.variationId,
      label: exerciseLabel(previousSignal.performed).trim() || previousSignal.performed.exerciseId,
      metric,
      previousBest: previousSignal.value,
      recentBest: recentSignal.value,
      mapping: previousSignal.mapping,
    });
  }
  coverage.comparableSignals = comparable.length;

  const contributors = new Map<MuscleId, MuscleDevelopmentContributor[]>();
  for (const signal of comparable) {
    const add = (muscle: MuscleId, allocation: number) => {
      const change = (signal.recentBest / signal.previousBest - 1) * 100;
      const rows = contributors.get(muscle) ?? [];
      rows.push({
        exerciseId: signal.exerciseId,
        variationId: signal.variationId,
        label: signal.label,
        metric: signal.metric,
        previousBest: signal.previousBest,
        recentBest: signal.recentBest,
        change,
        allocation,
      });
      contributors.set(muscle, rows);
    };
    signal.mapping.primary.forEach((muscle) => add(muscle, PRIMARY_WEIGHT));
    signal.mapping.secondary.forEach((muscle) => add(muscle, SECONDARY_WEIGHT));
  }

  const rawStats = MUSCLES.map((muscle) => {
    const rows = contributors.get(muscle) ?? [];
    if (rows.length === 0) return { muscle, change: null, contributors: rows };
    const totalWeight = rows.reduce((sum, row) => sum + row.allocation, 0);
    const logMean = rows.reduce(
      (sum, row) => sum + row.allocation * Math.log(row.recentBest / row.previousBest),
      0,
    ) / totalWeight;
    return {
      muscle,
      change: (Math.exp(logMean) - 1) * 100,
      contributors: topDevelopmentContributors(rows, rows.length),
    };
  });
  const maxPositive = Math.max(0, ...rawStats.map((stat) => stat.change ?? 0));
  const maxNegativeMagnitude = Math.max(0, ...rawStats.map((stat) => Math.max(0, -(stat.change ?? 0))));
  const muscles: MuscleDevelopmentStat[] = rawStats.map((stat) => {
    let score: number | null = null;
    if (stat.change != null) {
      if (stat.change === 0) score = 50;
      else if (stat.change > 0) score = 50 + (50 * stat.change) / maxPositive;
      else score = 50 - (50 * -stat.change) / maxNegativeMagnitude;
    }
    return { ...stat, score };
  });

  return {
    catalogAvailable: catalog.length > 0,
    windowDays: MUSCLE_DEVELOPMENT_WINDOW_DAYS,
    recentWindowStart,
    previousWindowStart,
    now: nowMs,
    muscles,
    coverage,
  };
}
