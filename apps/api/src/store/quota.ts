import { TEMPORARY_AI_DAILY_LIMIT, type AIQuotaStatus } from '@timber/contract/ai';
import { firestorePaths } from '@timber/contract/firestore';
import { commit, getDoc } from './rest.js';

export interface AIUsage {
  date: string;
  count: number;
}

/**
 * Reads today's counter. Returns the raw document alongside the decoded value
 * because a writer needs its `updateTime` for the precondition below.
 */
async function readUsage(uid: string) {
  const doc = await getDoc(firestorePaths.privateAiUsage(uid));
  // During copy-before-cleanup, a missing private doc reads the legacy value
  // once; the writers below then write the canonical private document.
  const legacy = doc ? undefined : await getDoc(firestorePaths.user(uid), ['aiUsage']);
  return { doc, usage: (doc?.fields ?? legacy?.fields.aiUsage) as unknown as AIUsage | undefined };
}

/**
 * The account's AI opt-in (`users/{uid}.aiEnabled`).
 *
 * Only a literal `true` counts: an absent field, a null, or anything a rules
 * change ever lets through means off. AI is not a feature a user gets by
 * default — it ships their workout history to a third-party provider — so the
 * unknown case has to fail closed.
 *
 * ponytail: one extra Firestore read per AI request. Fold it into `readUsage`'s
 * round trip only if AI latency ever shows up as a problem.
 */
export async function readAIEnabled(uid: string): Promise<boolean> {
  const doc = await getDoc(firestorePaths.user(uid), ['aiEnabled']);
  return isAIEnabledField(doc?.fields.aiEnabled);
}

/** Pure half of `readAIEnabled`, split out so the fail-closed rule is testable. */
export function isAIEnabledField(value: unknown): boolean {
  return value === true;
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
  const path = firestorePaths.privateAiUsage(uid);
  const today = todayUTC();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { doc, usage: existing } = await readUsage(uid);
    const next = nextUsage(existing, today);

    if (!next) {
      throw Object.assign(new Error("You've used all your AI suggestions for today."), { status: 429 });
    }

    try {
      await commit([
        {
          path,
          fields: { ...next },
          updateMask: ['date', 'count'],
          currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
        },
      ]);
      // Same formula GET /api/ai/quota answers with, so a response's `remaining`
      // and a later peek can never disagree.
      return quotaStatus(next, today).remaining;
    } catch (e) {
      const isConflict = (e as { status?: number }).status === 409;
      if (isConflict && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }

  // Unreachable: the loop above always returns or throws.
  throw new Error('consumeQuota: exhausted retries');
}

/** Pure: given the stored usage record, report the quota. Mirrors `nextUsage`'s rollover rule. */
export function quotaStatus(
  existing: AIUsage | undefined,
  today: string,
  limit: number = TEMPORARY_AI_DAILY_LIMIT
): AIQuotaStatus {
  const count = existing?.date === today ? existing.count : 0;
  // Clamped: a limit lowered after someone spent above it would go negative.
  return { remaining: Math.max(0, limit - count), limit, date: today };
}

/**
 * Reports the quota without claiming from it — what `GET /api/ai/quota` serves.
 *
 * This is the client's only source for how many credits are left: deriving it
 * from a bundled `TEMPORARY_AI_DAILY_LIMIT` means a shipped app shows the wrong
 * number (and gates its own button early) whenever the cap changes.
 *
 * Read-only, so no precondition and no retry loop — a racing `consumeQuota`
 * just means the answer is one stale, and the next response's `remaining`
 * corrects it.
 */
export async function peekQuota(uid: string): Promise<AIQuotaStatus> {
  const today = todayUTC();
  const { usage } = await readUsage(uid);
  return quotaStatus(usage, today);
}

/**
 * Gives back a claimed call after the generation itself failed — the user
 * shouldn't lose one daily use to a provider outage.
 *
 * Only refunds within the same UTC day: if the date rolled over between the
 * claim and the failure, the counter has already reset and decrementing it
 * would hand out a free extra call. Swallows its own errors so a failed
 * refund can't mask the original failure the caller is reporting.
 */
export async function refundQuota(uid: string): Promise<void> {
  const path = firestorePaths.privateAiUsage(uid);
  const today = todayUTC();

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { doc, usage } = await readUsage(uid);
      if (usage?.date !== today || usage.count <= 0) return;

      try {
        await commit([
          {
            path,
            fields: { date: today, count: usage.count - 1 },
            updateMask: ['date', 'count'],
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
