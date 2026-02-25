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

  // Tally how many sessions each exercise appears in
  const exerciseSessions: Record<string, number> = {};
  recent.forEach((w) => {
    const seen = new Set<string>();
    w.exercises.forEach((ex) => {
      const name = ex.name.trim();
      if (!name) return;
      if (!seen.has(name)) {
        exerciseSessions[name] = (exerciseSessions[name] || 0) + 1;
        seen.add(name);
      }
    });
  });

  const exerciseList = Object.entries(exerciseSessions)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count} session${count > 1 ? 's' : ''})`)
    .join(', ');

  const prompt = `You are a fitness coach analyzing a user's workout data from the past 30 days.

Exercises performed (name and number of sessions): ${exerciseList}

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
