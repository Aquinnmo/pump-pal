import { Workout } from '@/components/workout-card';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/constants/gemini-config';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Asks Gemini to generate a list of workout day/type names for a custom
 * training split described in plain text (e.g. "3-day full body + 1 cardio day").
 * Returns an ordered array of day names such as ["Full Body A", "Full Body B", "Cardio"].
 */
export async function generateSplitWorkoutNames(customSplitDescription: string): Promise<string[]> {
  const prompt = `You are an expert personal trainer. A user has described their custom training split as:
"${customSplitDescription}"

Generate a concise, ordered list of UNIQUE workout day names for this split.
Rules:
- If the description lists specific muscle groups or days (e.g. "Delts and Back"), treat EACH one as a separate workout day with its own distinct name (e.g. ["Delts", "Back"]).
- Return between 2 and 6 names total.
- Every name in the array MUST be different — no duplicates, no near-duplicates, no combined names.
- Each name should be short (1–3 words), title-cased, and suitable as a workout session label.
- Do NOT combine muscle groups into one name unless the user explicitly described a combined session.
- Do NOT include rest days.
- Do NOT add a letter suffix (A/B) unless the user described repeated identical days.
- Return ONLY a valid JSON array of strings with no markdown fences and no explanation.
Examples:
  Input: "Delts and Back" → ["Delts", "Back"]
  Input: "push pull legs" → ["Push", "Pull", "Legs"]
  Input: "3-day full body + 1 cardio" → ["Full Body A", "Full Body B", "Full Body C", "Cardio"]`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonText = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  const parsed: string[] = JSON.parse(jsonText);
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

interface CurrentExercise {
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
 * Calls Gemini to suggest exercises to complete a balanced workout.
 *
 * @param workoutName  The name of today's workout day (e.g. "Push", "Legs")
 * @param splitType    The user's training split (e.g. "Push / Pull / Legs")
 * @param current      Exercises already added to the current workout
 * @param history      All saved workouts (used for the past-30-day history)
 */
export async function suggestWorkoutCompletion(
  workoutName: string,
  splitType: string,
  current: CurrentExercise[],
  history: Workout[]
): Promise<SuggestedExercise[]> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Summarise past 30 days (same logic as muscle analysis)
  const recent = history.filter((w) => {
    const ts = w.date instanceof Date ? w.date.getTime() : w.date.seconds * 1000;
    return ts >= thirtyDaysAgo;
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
    w.exercises.forEach((ex) => {
      const name = ex.name.trim();
      if (!name) return;
      if (!statsMap[name]) {
        statsMap[name] = {
          sessions: 0,
          totalSets: 0,
          totalReps: 0,
          weights: new Set(),
          maxDurationSecs: 0,
          bodyweight: !!ex.bodyweight,
          isDuration: ex.exerciseType === 'Sets of Duration',
        };
      }
      const s = statsMap[name];
      if (!seen.has(name)) { s.sessions += 1; seen.add(name); }
      s.totalSets += ex.sets ?? 1;
      if (ex.exerciseType === 'Sets of Duration') {
        const secs = (ex.durationMinutes ?? 0) * 60 + (ex.durationSeconds ?? 0);
        s.maxDurationSecs = Math.max(s.maxDurationSecs, secs * (ex.sets ?? 1));
      } else {
        s.totalReps += (ex.reps ?? 0) * (ex.sets ?? 1);
        if (!ex.bodyweight && ex.weight > 0) s.weights.add(ex.weight);
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
    .filter((ex) => ex.name.trim())
    .map((ex) => {
      if (ex.exerciseType === 'Sets of Duration') {
        return `  - ${ex.name}: ${ex.sets} sets × ${ex.durationMinutes}m ${ex.durationSeconds}s`;
      }
      if (ex.bodyweight) {
        return `  - ${ex.name}: ${ex.sets} sets × ${ex.reps} reps (bodyweight)`;
      }
      return `  - ${ex.name}: ${ex.sets} sets × ${ex.reps} reps @ ${ex.weight || '?'} lbs`;
    })
    .join('\n') || '  (nothing yet)';

  const prompt = `You are an expert personal trainer. A user is logging a workout and wants you to suggest exercises to complete it in a balanced way.

TRAINING SPLIT: ${splitType || 'Not specified'}
TODAY'S WORKOUT DAY: ${workoutName || 'Not specified'}

EXERCISES ALREADY LOGGED TODAY:
${currentLines}

PAST 30 DAYS OF WORKOUT HISTORY (for context on volume, frequency, and weights used):
${historyLines}

TASK:
Suggest 2–5 additional exercises to round out this workout. Take into account:
- The workout day type (e.g. Push = chest/shoulders/triceps, Pull = back/biceps, Legs = quads/hamstrings/glutes/calves)
- What has already been done today (avoid duplicates, ensure muscle balance within the session)
- Past history (avoid further overtraining muscles already hit frequently; prefer exercises that address undertrained ones where relevant)
- Realistic sets/reps/weights based on historical weights used (if no history exists, use sensible beginner-intermediate defaults)

For weighted exercises suggest a weight in lbs based on history. If no history, pick a reasonable starting weight.
For bodyweight exercises set bodyweight to true and weight to "0".
For duration exercises set exerciseType to "Sets of Duration" and provide durationMinutes + durationSeconds.

Return ONLY a valid JSON array with no markdown fences, no explanation:
[
  {
    "name": "Exercise Name",
    "exerciseType": "Sets of Reps",
    "sets": 3,
    "reps": 10,
    "durationMinutes": 0,
    "durationSeconds": 0,
    "weight": "135",
    "bodyweight": false
  }
]`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonText = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();

  const parsed: SuggestedExercise[] = JSON.parse(jsonText);

  return parsed.map((ex) => ({
    name: ex.name ?? '',
    exerciseType: ex.exerciseType === 'Sets of Duration' ? 'Sets of Duration' : 'Sets of Reps',
    sets: Number(ex.sets) || 3,
    reps: Number(ex.reps) || 10,
    durationMinutes: Number(ex.durationMinutes) || 0,
    durationSeconds: Number(ex.durationSeconds) || 30,
    weight: String(ex.weight ?? ''),
    bodyweight: !!ex.bodyweight,
  }));
}
