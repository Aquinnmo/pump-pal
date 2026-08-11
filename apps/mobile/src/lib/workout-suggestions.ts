import { BODY_PART_MUSCLES, bodyPartLabel } from '@/constants/body-parts';
import { Injury } from '@/types/user';
import { DraftExerciseRow, ExerciseSearchOption, Workout } from '@/types/workout';
import { callAI } from '@/lib/ai-client';
import { rankSearchOptions, slugify } from '@/lib/exercise-catalog';
import { exerciseLabel, isDurationExercise, makeUid, toDateObj } from '@/lib/workout-conversion';

/**
 * Asks the configured AI model to generate a list of workout day/type names for a custom
 * training split described in plain text (e.g. "3-day full body + 1 cardio day").
 * Returns an ordered array of day names such as ["Full Body A", "Full Body B", "Cardio"].
 */
export async function generateSplitWorkoutNames(customSplitDescription: string): Promise<string[]> {
  const { data: parsed } = await callAI('split-names', { description: customSplitDescription });

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return parsed.filter((n) => {
    if (typeof n !== 'string' || !n.trim()) return false;
    const key = n.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface SuggestedExercise {
  name: string;
  exerciseType: 'Sets of Reps' | 'Sets of Duration';
  sets: number;
  reps: number;
  durationMinutes: number;
  durationSeconds: number;
  weight: string;
  bodyweight: boolean;
}

/**
 * Convert model output into rows that can be appended to either workout
 * editor. Catalog matches retain their canonical ids; unknown names remain in
 * the existing under-review flow.
 */
export function suggestedExercisesToDraftRows(
  suggested: SuggestedExercise[],
  catalogOptions: ExerciseSearchOption[]
): DraftExerciseRow[] {
  return suggested.map((ex) => {
    const match = rankSearchOptions(catalogOptions, ex.name, [])[0];
    const resolved = match
      ? { exerciseId: match.exerciseId, variationId: match.variationId, label: match.label }
      : { exerciseId: 'under-review', variationId: `ur_${slugify(ex.name)}`, label: ex.name };
    return {
      uid: makeUid(),
      ...resolved,
      exerciseType: ex.exerciseType,
      bodyweight: ex.bodyweight,
      sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({
        reps: ex.reps,
        weight: ex.weight,
        durationMinutes: ex.durationMinutes,
        durationSeconds: ex.durationSeconds,
      })),
    };
  });
}

function formatActiveInjuries(injuries: Injury[]): string {
  if (injuries.length === 0) return '  (none reported)';

  return injuries.map((injury) => {
    const affectedMuscles = [...new Set([
      ...(BODY_PART_MUSCLES[injury.bodyPart] ?? []),
      ...(injury.muscles ?? []),
    ])].join(', ');
    const details = [
      `${bodyPartLabel(injury.bodyPart)}${injury.side ? ` (${injury.side})` : ''}`,
      `severity: ${injury.severity}`,
      affectedMuscles ? `affected muscles: ${affectedMuscles}` : undefined,
      injury.avoid?.length ? `avoid: ${injury.avoid.join(', ')}` : undefined,
      injury.notes ? `notes: ${injury.notes}` : undefined,
    ].filter(Boolean);
    return `  - ${details.join('; ')}`;
  }).join('\n');
}

/**
 * Calls the configured AI model to suggest exercises to complete a balanced workout.
 *
 * @param workoutName  The name of today's workout day (e.g. "Push", "Legs")
 * @param splitType    The user's training split (e.g. "Push / Pull / Legs")
 * @param current      Exercises already added to the current workout
 * @param history      All saved workouts (used for the past-30-day history)
 *
 * Returns the suggestions plus how many AI calls the user has left today, as
 * counted by the server — the client no longer tracks the quota itself.
 */
export async function suggestWorkoutCompletion(
  workoutName: string,
  splitType: string,
  current: DraftExerciseRow[],
  history: Workout[],
  activeInjuries: Injury[] = []
): Promise<{ suggestions: SuggestedExercise[]; remaining: number | null }> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Summarise past 30 days (same logic as muscle analysis)
  const recent = history.filter((w) => {
    const date = toDateObj(w.date);
    return date !== null && date.getTime() >= thirtyDaysAgo;
  });

  interface ExStats {
    sessions: number;
    totalSets: number;
    totalReps: number;
    weights: Set<number>;
    maxDurationSecs: number;
    bodyweight: boolean;
    isDuration: boolean;
  }

  const statsMap: Record<string, ExStats> = {};
  recent.forEach((w) => {
    const seen = new Set<string>();
    (w.performedExercises ?? []).forEach((pe) => {
      const name = exerciseLabel(pe).trim();
      if (!name) return;
      const isDuration = isDurationExercise(pe);
      if (!statsMap[name]) {
        statsMap[name] = {
          sessions: 0,
          totalSets: 0,
          totalReps: 0,
          weights: new Set(),
          maxDurationSecs: 0,
          bodyweight: pe.sets.some((s) => s.bodyweight),
          isDuration,
        };
      }
      const s = statsMap[name];
      if (!seen.has(name)) { s.sessions += 1; seen.add(name); }
      s.totalSets += pe.sets.length;
      if (isDuration) {
        const totalSecs = pe.sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0);
        s.maxDurationSecs = Math.max(s.maxDurationSecs, totalSecs);
      } else {
        pe.sets.forEach((set) => {
          s.totalReps += set.reps ?? 0;
          if (!set.bodyweight && (set.weight ?? 0) > 0) s.weights.add(set.weight!);
        });
      }
    });
  });

  const historyLines = Object.entries(statsMap)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([name, s]) => {
      if (s.isDuration) {
        return `  - ${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, max ~${s.maxDurationSecs}s total duration`;
      }
      if (s.bodyweight) {
        return `  - ${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, ${s.totalReps} total reps (bodyweight)`;
      }
      const wList = [...s.weights].sort((a, b) => a - b).join('/');
      return `  - ${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, ${s.totalReps} total reps${wList ? ` @ ${wList} lbs` : ''}`;
    })
    .join('\n') || '  (no recent history)';

  // Describe what's already in today's workout
  const currentLines = current
    .filter((ex) => ex.label.trim())
    .map((ex) => {
      const setCount = ex.sets.length;
      const first = ex.sets[0];
      if (ex.exerciseType === 'Sets of Duration') {
        return `  - ${ex.label}: ${setCount} sets × ${first?.durationMinutes ?? 0}m ${first?.durationSeconds ?? 0}s`;
      }
      if (ex.bodyweight) {
        return `  - ${ex.label}: ${setCount} sets × ${first?.reps ?? 0} reps (bodyweight)`;
      }
      return `  - ${ex.label}: ${setCount} sets × ${first?.reps ?? 0} reps @ ${first?.weight || '?'} lbs`;
    })
    .join('\n') || '  (nothing yet)';

  const activeInjuryLines = formatActiveInjuries(activeInjuries);

  // The prompt template and output schema live server-side in apps/api/src/ai/prompts.ts
  // and packages/contract/src/ai-contract.ts; only these computed summaries cross the wire.
  const { data, remaining } = await callAI('workout-completion', {
    workoutName,
    splitType,
    currentLines,
    historyLines,
    injuryLines: activeInjuryLines,
  });

  return { suggestions: data, remaining };
}
