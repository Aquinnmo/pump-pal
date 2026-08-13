import { z } from 'zod';

/**
 * Wire contract for the `/api/ai` proxy. Imported by both the Expo client
 * (`utils/ai-client.ts`) and the Vercel function (`api/`), so this file must
 * import nothing but `zod` — no Expo, React Native, or Firebase.
 *
 * One zod schema per op drives both server-side generation (`Output.object` /
 * `Output.array` in `apps/api/src/ai/prompts.ts`) and the client-side return type,
 * so the two sides cannot drift the way hand-written duplicate types could.
 */

export const AI_MAX_RETRIES = 2;
export const TEMPORARY_AI_DAILY_LIMIT = 7;

/**
 * Input validation at the trust boundary. Every field is a bounded string —
 * without the length caps a client could push an arbitrarily large prompt
 * through and run up the provider bill inside a single quota unit.
 */
const summary = z.string().max(20_000);

const suggestedExercise = z.object({
  name: z.string(),
  exerciseType: z.enum(['Sets of Reps', 'Sets of Duration']),
  sets: z.number(),
  reps: z.number(),
  durationMinutes: z.number(),
  durationSeconds: z.number(),
  weight: z.string(),
  bodyweight: z.boolean(),
});

export const AI_OPS = {
  'muscle-analysis': {
    input: z.object({ volumeTable: summary, regionList: summary }),
    output: z.object({
      overTrained: z.array(z.string()),
      underTrained: z.array(z.string()),
    }),
  },
  'workout-completion': {
    input: z.object({
      workoutName: z.string().max(200),
      splitType: z.string().max(200),
      currentLines: summary,
      historyLines: summary,
      injuryLines: summary,
    }),
    output: z.array(suggestedExercise),
  },
  'split-names': {
    input: z.object({ description: z.string().max(2_000) }),
    output: z.array(z.string()),
  },
  'daily-name': {
    input: z.object({}),
    output: z.object({ name: z.string() }),
  },
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>;

export type AIOp = keyof typeof AI_OPS;
export type AIOpInput<Op extends AIOp> = z.infer<(typeof AI_OPS)[Op]['input']>;
export type AIOpOutput<Op extends AIOp> = z.infer<(typeof AI_OPS)[Op]['output']>;

export interface AIResponse<Op extends AIOp> {
  data: AIOpOutput<Op>;
  /** AI calls left today for this user, or null for ops exempt from the cap. */
  remaining: number | null;
}

export const isAIOp = (value: unknown): value is AIOp =>
  typeof value === 'string' && value in AI_OPS;
