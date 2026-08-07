import { TEMPORARY_AI_DAILY_LIMIT } from '../../../shared/ai-contract.js';
import { commit, getDoc } from './rest.js';

export interface AIUsage {
  date: string;
  count: number;
}

/** Today's date as YYYY-MM-DD in UTC. Matches the key the client used to write. */
export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Pure: given the stored usage record, decide the next one.
 *
 * Returns `null` when the user is already at the daily limit. A record from a
 * previous UTC day is treated as absent, which is what makes the quota roll
 * over without a scheduled reset job.
 */
export function nextUsage(
  existing: AIUsage | undefined,
  today: string,
  limit: number = TEMPORARY_AI_DAILY_LIMIT
): AIUsage | null {
  const count = existing?.date === today ? existing.count : 0;
  if (count >= limit) return null;
  return { date: today, count: count + 1 };
}

/**
 * Firestore transactions aren't available over the REST API the way the
 * Admin SDK exposed them, so a single-document counter is done as optimistic
 * concurrency instead: read the value plus its `updateTime`, then commit with
 * that `updateTime` as a precondition. A 409 means someone else wrote first —
 * re-read and retry, capped so a hot document can't loop forever.
 */
const MAX_ATTEMPTS = 3;

/**
 * Atomically claims one AI call for `uid` and returns how many are left today.
 * Throws a 429-tagged error when the user is out.
 *
 * Claims before generation runs, not after, so parallel requests can't all
 * slip through the cap.
 */
export async function consumeQuota(uid: string): Promise<number> {
  const path = `users/${uid}`;
  const today = todayUTC();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await getDoc(path, ['aiUsage']);
    const existing = doc?.fields.aiUsage as unknown as AIUsage | undefined;
    const next = nextUsage(existing, today);

    if (!next) {
      throw Object.assign(new Error("You've used all your AI suggestions for today."), { status: 429 });
    }

    try {
      await commit([
        {
          path,
          fields: { aiUsage: next },
          updateMask: ['aiUsage'],
          currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
        },
      ]);
      return TEMPORARY_AI_DAILY_LIMIT - next.count;
    } catch (e) {
      const isConflict = (e as { status?: number }).status === 409;
      if (isConflict && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }

  // Unreachable: the loop above always returns or throws.
  throw new Error('consumeQuota: exhausted retries');
}

/**
 * Gives back a claimed call after the generation itself failed — the user
 * shouldn't lose one of three daily uses to a provider outage.
 *
 * Only refunds within the same UTC day: if the date rolled over between the
 * claim and the failure, the counter has already reset and decrementing it
 * would hand out a free extra call. Swallows its own errors so a failed
 * refund can't mask the original failure the caller is reporting.
 */
export async function refundQuota(uid: string): Promise<void> {
  const path = `users/${uid}`;
  const today = todayUTC();

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const doc = await getDoc(path, ['aiUsage']);
      const usage = doc?.fields.aiUsage as unknown as AIUsage | undefined;
      if (usage?.date !== today || usage.count <= 0) return;

      try {
        await commit([
          {
            path,
            fields: { aiUsage: { date: today, count: usage.count - 1 } },
            updateMask: ['aiUsage'],
            currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
          },
        ]);
        return;
      } catch (e) {
        const isConflict = (e as { status?: number }).status === 409;
        if (isConflict && attempt < MAX_ATTEMPTS - 1) continue;
        throw e;
      }
    }
  } catch (e) {
    console.error('Failed to refund AI quota for', uid, e);
  }
}
