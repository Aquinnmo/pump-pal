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
export const TEMPORARY_AI_DAILY_LIMIT = 10;

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
  /**
   * AI calls left today for this user, after this one. Every `/api/ai` response
   * carries it — including ops exempt from the cap, which report the balance
   * without spending — so a client's cached count refreshes on any AI call.
   *
   * Still nullable on the wire: a Worker deployed before this change answers
   * `null` for exempt ops, and a client must not treat that as zero.
   */
  remaining: number | null;
}

/**
 * `GET /api/ai/quota`. The client renders `remaining` rather than deriving it
 * from `TEMPORARY_AI_DAILY_LIMIT` — that constant is bundled into a shipped app
 * and goes stale the moment the server-side cap changes, so the server is the
 * only place the limit is known.
 */
export const aiQuotaStatus = z.object({
  remaining: z.number().int().min(0),
  limit: z.number().int().positive(),
  /** The UTC day `remaining` is counted against. */
  date: z.string(),
});
export type AIQuotaStatus = z.infer<typeof aiQuotaStatus>;

export const isAIOp = (value: unknown): value is AIOp =>
  typeof value === 'string' && value in AI_OPS;
