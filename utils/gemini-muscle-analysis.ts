import { Workout } from '@/components/workout-card';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/constants/gemini-config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface MuscleInsights {
  overTrained: string[];
  underTrained: string[];
}

/**
 * Analyses the past 30 days of workouts with Gemini and returns
 * up to 3 over-trained and up to 3 under-trained muscle groups.
 */
export async function analyzeMuscles(workouts: Workout[]): Promise<MuscleInsights> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Filter to last 30 days
  const recent = workouts.filter((w) => {
    const ts = w.date instanceof Date ? w.date.getTime() : w.date.seconds * 1000;
    return ts >= thirtyDaysAgo;
  });

  if (recent.length === 0) {
    return { overTrained: [], underTrained: [] };
  }

  // Aggregate detailed stats per exercise across all sessions
  interface ExerciseStats {
    sessions: number;
    totalSets: number;
    totalReps: number;
    weights: Set<number>;        // for weighted exercises
    maxDurationSecs: number;     // for duration exercises
    bodyweight: boolean;
    isDuration: boolean;
  }

  const statsMap: Record<string, ExerciseStats> = {};

  recent.forEach((w) => {
    const seenThisWorkout = new Set<string>();
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
      if (!seenThisWorkout.has(name)) {
        s.sessions += 1;
        seenThisWorkout.add(name);
      }

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

  const exerciseList = Object.entries(statsMap)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([name, s]) => {
      if (s.isDuration) {
        return `${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, max ~${s.maxDurationSecs}s total duration`;
      }
      if (s.bodyweight) {
        return `${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, ${s.totalReps} total reps`;
      }
      const weightList = [...s.weights].sort((a, b) => a - b).join('/');
      return `${name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''}, ${s.totalSets} sets, ${s.totalReps} total reps${weightList ? ` @ ${weightList} lbs` : ''}`;
    })
    .join('\n');

  const prompt = `You are a fitness coach analyzing a user's workout data from the past 30 days.

Exercises performed (one per line — sessions, sets, total reps, and weights used):
${exerciseList}

Based on this data:
1. Identify up to 3 muscle groups that are OVER-TRAINED (worked very frequently, at risk of overuse or insufficient recovery).
2. Identify up to 3 muscle groups that are UNDER-TRAINED (neglected or worked far less than others, creating imbalances).

Consider all major muscle groups: Chest, Back, Shoulders, Biceps, Triceps, Forearms, Abs/Core, Quads, Hamstrings, Glutes, Calves, Hip Flexors, Lower Back, Traps, Lats, Rear Delts, Front Delts, Side Delts.

Return ONLY a valid JSON object with no markdown fences, no explanation, just this structure:
{"overTrained":["Muscle1","Muscle2"],"underTrained":["Muscle1","Muscle2"]}

IF THERE IS NOTHING BEING OVER/UNDER TRAINED RETURN "All good! 👍" as the only muscle for each list`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip any accidental markdown code fences
  const jsonText = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();

  const parsed: MuscleInsights = JSON.parse(jsonText);

  return {
    overTrained: (parsed.overTrained ?? []).slice(0, 3),
    underTrained: (parsed.underTrained ?? []).slice(0, 3),
  };
}
