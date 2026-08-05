import { generateText, Output } from 'ai';
import { AI_MAX_RETRIES, AI_OPS, type AIOp, type AIOpInput, type AIOpOutput } from '../../../shared/ai-contract';
import { getAIModel } from './model';

/**
 * Server-owned prompt templates, one per operation. Each reads its output
 * schema from `AI_OPS[op].output` (shared/ai-contract.ts) instead of a
 * locally declared zod schema, so the same definition constrains generation
 * and types the client.
 *
 * The client sends structured input, never a raw prompt — otherwise any signed-in
 * user could use this endpoint as a general-purpose LLM on the project's key.
 *
 * ponytail: the summary fields are client-computed text interpolated into these
 * templates, so a determined user can still steer the model within one op. The
 * daily cap bounds the cost, which is the goal. Tighten to fully structured
 * input only if abuse shows up.
 *
 * This directory imports nothing from `store/` or `auth.ts` — no Firestore, no auth.
 */

// ---------------------------------------------------------------- muscle-analysis

async function muscleAnalysis(
  input: AIOpInput<'muscle-analysis'>
): Promise<AIOpOutput<'muscle-analysis'>> {
  const prompt = `You are a strength coach analyzing a user's training volume over the last 30 days.

Volume is measured in "effective weekly sets" per muscle: each working set counts fully (1.0) toward the exercise's primary muscles and half (0.5) toward its secondary muscles, averaged per week. A muscle at 0.0 sets/wk was not trained at all.

Per-muscle volume (sorted high to low):
${input.volumeTable}

Muscle regions:
${input.regionList}

Guidance:
- A productive hypertrophy range is roughly 10–20 effective sets per muscle per week. Notably below that (especially 0.0) signals UNDER-training; well above ~20 — or high frequency combined with consistently high RPE — signals OVER-training / poor recovery.
- Also judge each muscle relative to the user's own overall volume: a muscle far below the others is a likely imbalance even if it isn't at zero.

Tasks:
1. Identify up to 3 OVER-trained muscles (most at risk of overuse or insufficient recovery).
2. Identify up to 3 UNDER-trained muscles (most neglected or creating imbalance).

Naming rules:
- Use the specific muscle names exactly as written in the volume list above.
- ONLY when an entire region (all of its listed muscles) is uniformly over- or under-trained, name the region instead of listing each muscle individually.

Return ONLY a valid JSON object with no markdown fences and no explanation, exactly this structure:
{"overTrained":["Muscle1","Muscle2"],"underTrained":["Muscle1","Muscle2"]}

If a category has no meaningful findings, return an empty array for that category. If neither category has findings, return empty arrays for both.`;

  const { output } = await generateText({
    model: getAIModel(),
    prompt,
    maxRetries: AI_MAX_RETRIES,
    output: Output.object({ schema: AI_OPS['muscle-analysis'].output }),
  });

  return output;
}

// ------------------------------------------------------------- workout-completion

async function workoutCompletion(
  input: AIOpInput<'workout-completion'>
): Promise<AIOpOutput<'workout-completion'>> {
  const prompt = `You are an expert personal trainer. A user is logging a workout and wants you to suggest exercises to complete it in a balanced way.

TRAINING SPLIT: ${input.splitType || 'Not specified'}
TODAY'S WORKOUT DAY: ${input.workoutName || 'Not specified'}

EXERCISES ALREADY LOGGED TODAY:
${input.currentLines}

PAST 30 DAYS OF WORKOUT HISTORY (for context on volume, frequency, and weights used):
${input.historyLines}

ACTIVE USER-REPORTED INJURIES:
${input.injuryLines}

TASK:
Suggest 2–5 additional exercises to round out this workout. Take into account:
- The selected workout day is authoritative: suggest exercises for this day only and keep the workout balanced within this day, not across the whole split
- Stay strictly inside the user's split boundaries. Do not pull exercises from the next, previous, or another split day just to add variety; for example, if the split is Push / Pull / Legs and today's day is Pull, do not suggest calf or other Legs-day exercises even if Legs is next
- The split is a prioritization guide, not an exhaustive whitelist: muscle groups that are not assigned to a split day, such as core in a Push / Pull / Legs split, may be suggested on any day when they complement the workout
- The workout day type (e.g. Push = chest/shoulders/triceps, Pull = back/biceps, Legs = quads/hamstrings/glutes/calves)
- What has already been done today (avoid duplicates, ensure muscle balance within the session)
- Past history (avoid further overtraining muscles already hit frequently; prefer exercises that address undertrained ones where relevant)
- Active injuries above (avoid exercises or movements that could aggravate an injury, honor explicit avoid instructions, and prefer alternatives that train unaffected areas)
- Do not diagnose, prescribe treatment, or claim that any exercise is medically cleared. If no reasonable safe additions remain, return an empty array.
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

  const { output: parsed } = await generateText({
    model: getAIModel(),
    prompt,
    maxRetries: AI_MAX_RETRIES,
    output: Output.array({ element: AI_OPS['workout-completion'].output.element }),
  });

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

// ------------------------------------------------------------------- split-names

async function splitNames(input: AIOpInput<'split-names'>): Promise<AIOpOutput<'split-names'>> {
  const prompt = `You are an expert personal trainer. A user has described their custom training split as:
"${input.description}"

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

  const { output } = await generateText({
    model: getAIModel(),
    prompt,
    maxRetries: AI_MAX_RETRIES,
    output: Output.array({ element: AI_OPS['split-names'].output.element }),
  });

  return output;
}

// -------------------------------------------------------------------- daily-name

/**
 * Generates today's shared daily name. Returns only the sanitized string —
 * no Firestore. Caching lives in `store/daily-name.ts`.
 */
export async function generateDailyName(): Promise<string> {
  const prompt = `Give me one single random human first name. There should be a 10% chance of generating a medieval ruler's name. Return ONLY the name itself with no punctuation, explanation, or extra text. You are allowed 10 characters MAXIMUM.`;

  const { text } = await generateText({ model: getAIModel(), prompt, maxRetries: AI_MAX_RETRIES });
  const name = text.trim().replace(/[^a-zA-Z'\- ]/g, '').trim();
  if (!name) throw new Error('AI model returned an empty name');

  return name;
}

// ---------------------------------------------------------------------- dispatch

/**
 * Dispatches the three ops that generate directly from client input.
 * `daily-name` is handled separately by `generateDailyName` + the cache in
 * `store/daily-name.ts` — it isn't part of this dispatch.
 */
export async function runPrompt<Op extends Exclude<AIOp, 'daily-name'>>(
  op: Op,
  input: AIOpInput<Op>
): Promise<AIOpOutput<Op>> {
  switch (op) {
    case 'muscle-analysis':
      return muscleAnalysis(input as AIOpInput<'muscle-analysis'>) as Promise<AIOpOutput<Op>>;
    case 'workout-completion':
      return workoutCompletion(input as AIOpInput<'workout-completion'>) as Promise<AIOpOutput<Op>>;
    case 'split-names':
      return splitNames(input as AIOpInput<'split-names'>) as Promise<AIOpOutput<Op>>;
    default:
      throw Object.assign(new Error(`Unknown op: ${op}`), { status: 400 });
  }
}
