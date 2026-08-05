import { isMuscleId, MUSCLE_REGIONS, MUSCLES, MuscleId, muscleLabel } from '@/constants/muscles';
import { CatalogExercise, Workout } from '@/types/workout';
import { callAI } from '@/utils/ai-client';
import { loadCatalog } from '@/utils/exercise-catalog';
import { exerciseLabel, toDateObj } from '@/utils/workout-conversion';

export interface MuscleInsights {
  overTrained: string[];
  underTrained: string[];
}

function normalizeInsightList(insights: string[]): string[] {
  return insights
    .map((insight) => insight.trim())
    .filter((insight) => insight.length > 0 && !insight.toLowerCase().startsWith('all good'))
    .slice(0, 3);
}

/** Converts model output and legacy cached sentinel values into the canonical empty-list state. */
export function normalizeMuscleInsights(insights: MuscleInsights): MuscleInsights {
  return {
    overTrained: normalizeInsightList(insights.overTrained ?? []),
    underTrained: normalizeInsightList(insights.underTrained ?? []),
  };
}

/** Per-muscle training-volume stat over the analysis window, normalised per week. */
export interface MuscleVolumeStat {
  muscle: MuscleId;
  weeklySets: number; // "effective sets": primary set = 1.0, secondary set = 0.5
  weeklySessions: number; // distinct workouts touching this muscle, per week
  avgRpe: number | null; // mean RPE across sets that recorded one, else null
  topExercises: string[]; // top contributing exercise labels
}

// Standard hypertrophy-volume weighting: a set fully loads primary muscles, half-loads secondary.
const PRIMARY_WEIGHT = 1.0;
const SECONDARY_WEIGHT = 0.5;
const WINDOW_DAYS = 30;
const WEEKS_IN_WINDOW = WINDOW_DAYS / 7; // ≈ 4.29

/**
 * Pure: attribute each performed set to canonical muscles via the exercise
 * catalog (exact exerciseId/variationId join — no name guessing) and roll up
 * per-week effective-set volume. Returns one entry for every canonical muscle,
 * including 0.0 for muscles never trained (needed to surface neglect).
 */
export function computeMuscleVolume(recent: Workout[], catalog: CatalogExercise[]): MuscleVolumeStat[] {
  type Muscles = { primary: MuscleId[]; secondary: MuscleId[] };
  const byExercise = new Map<string, Muscles>();
  const byVariation = new Map<string, Muscles>();

  catalog.forEach((ex) => {
    byExercise.set(ex.id, {
      primary: (ex.primaryMuscles ?? []).filter(isMuscleId),
      secondary: (ex.secondaryMuscles ?? []).filter(isMuscleId),
    });
    (ex.variations ?? []).forEach((v) => {
      byVariation.set(`${ex.id}::${v.id}`, {
        primary: (v.primaryMuscles ?? []).filter(isMuscleId),
        secondary: (v.secondaryMuscles ?? []).filter(isMuscleId),
      });
    });
  });

  interface Acc {
    effectiveSets: number;
    rpeSum: number;
    rpeCount: number;
    workouts: Set<string>;
    exercises: Map<string, number>; // label -> effective sets contributed
  }
  const acc = new Map<MuscleId, Acc>();
  const bucket = (m: MuscleId): Acc => {
    let a = acc.get(m);
    if (!a) {
      a = { effectiveSets: 0, rpeSum: 0, rpeCount: 0, workouts: new Set(), exercises: new Map() };
      acc.set(m, a);
    }
    return a;
  };

  recent.forEach((w) => {
    const workoutKey = w.id;
    (w.performedExercises ?? []).forEach((pe) => {
      const muscles =
        (pe.variationId != null ? byVariation.get(`${pe.exerciseId}::${pe.variationId}`) : undefined) ??
        byExercise.get(pe.exerciseId);
      if (!muscles) return; // unmatched / pending exercise — no attribution
      if (muscles.primary.length === 0 && muscles.secondary.length === 0) return;

      const setCount = pe.sets?.length ?? 0;
      if (setCount === 0) return;
      const label = exerciseLabel(pe).trim();

      // RPE across the sets that recorded one (unweighted mean input).
      let rpeSum = 0;
      let rpeCount = 0;
      (pe.sets ?? []).forEach((s) => {
        if (typeof s.rpe === 'number') {
          rpeSum += s.rpe;
          rpeCount += 1;
        }
      });

      const apply = (m: MuscleId, weight: number) => {
        const a = bucket(m);
        const contrib = setCount * weight;
        a.effectiveSets += contrib;
        a.workouts.add(workoutKey);
        a.rpeSum += rpeSum;
        a.rpeCount += rpeCount;
        a.exercises.set(label, (a.exercises.get(label) ?? 0) + contrib);
      };
      muscles.primary.forEach((m) => apply(m, PRIMARY_WEIGHT));
      muscles.secondary.forEach((m) => apply(m, SECONDARY_WEIGHT));
    });
  });

  return MUSCLES.map((muscle) => {
    const a = acc.get(muscle);
    if (!a) {
      return { muscle, weeklySets: 0, weeklySessions: 0, avgRpe: null, topExercises: [] };
    }
    const topExercises = [...a.exercises.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([name]) => name);
    return {
      muscle,
      weeklySets: a.effectiveSets / WEEKS_IN_WINDOW,
      weeklySessions: a.workouts.size / WEEKS_IN_WINDOW,
      avgRpe: a.rpeCount > 0 ? a.rpeSum / a.rpeCount : null,
      topExercises,
    };
  }).sort((a, b) => b.weeklySets - a.weeklySets);
}

/**
 * Analyses the past 30 days of workouts with the configured AI model and returns up to 3
 * over-trained and up to 3 under-trained muscle groups. Muscle attribution
 * comes from the exercise catalog (real primary/secondary muscles), not from
 * the model guessing what each exercise trains.
 */
export async function analyzeMuscles(workouts: Workout[]): Promise<MuscleInsights> {
  const now = Date.now();
  const thirtyDaysAgo = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const recent = workouts.filter((w) => toDateObj(w.date).getTime() >= thirtyDaysAgo);
  if (recent.length === 0) {
    return { overTrained: [], underTrained: [] };
  }

  const catalog = await loadCatalog();
  const stats = computeMuscleVolume(recent, catalog);

  // No muscle attribution at all (e.g. catalog failed to load) — don't emit garbage.
  if (stats.every((s) => s.weeklySets === 0)) {
    return { overTrained: [], underTrained: [] };
  }

  const volumeTable = stats
    .map((s) => {
      const rpe = s.avgRpe != null ? s.avgRpe.toFixed(1) : '—';
      const ex = s.topExercises.length ? s.topExercises.join(', ') : '(none)';
      return `${muscleLabel(s.muscle)}: ${s.weeklySets.toFixed(1)} sets/wk, ${s.weeklySessions.toFixed(
        1
      )} sessions/wk, avg RPE ${rpe} — ${ex}`;
    })
    .join('\n');

  const regionList = Object.entries(MUSCLE_REGIONS)
    .map(([region, muscles]) => `${region}: ${muscles.map(muscleLabel).join(', ')}`)
    .join('\n');

  // The prompt template and output schema live server-side in
  // api/_lib/ai/prompts.ts; only the computed data crosses the wire.
  const { data } = await callAI('muscle-analysis', { volumeTable, regionList });

  return normalizeMuscleInsights(data);
}
