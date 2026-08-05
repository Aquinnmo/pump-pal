import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAIOp, AI_OPS, type AIOp, type AIOpInput } from '../shared/ai-contract';
import { requireUid } from './_lib/auth';
import { generateDailyName, runPrompt } from './_lib/ai/prompts';
import { getCachedDailyName, setCachedDailyName } from './_lib/store/daily-name';
import { consumeQuota, refundQuota } from './_lib/store/quota';

/**
 * AI proxy. The provider API keys live only in this function's environment —
 * they are never shipped to a client. Callers authenticate with a Firebase ID
 * token and are capped by a server-enforced daily quota.
 *
 * This is the only place the three layers (auth, ai, store) meet.
 *
 * POST /api/ai
 *   headers: Authorization: Bearer <firebase id token>
 *   body:    { op, input }
 *   200:     { data, remaining }
 *   4xx/5xx: { error }
 *
 * No CORS handling: the web build is served from this same Vercel origin, and
 * the native app is not a browser, so no preflight ever occurs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let claimedFor: string | null = null;

  try {
    const uid = await requireUid(req.headers.authorization);

    const { op, input } = (req.body ?? {}) as { op?: unknown; input?: unknown };
    if (!isAIOp(op)) {
      return res.status(400).json({ error: 'Unknown operation' });
    }

    const parsed = AI_OPS[op].input.safeParse(input ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: `Invalid input for op "${op}"` });
    }

    if (op === 'daily-name') {
      const cached = await getCachedDailyName();
      const name = cached ?? (await setCachedDailyName(await generateDailyName()));
      return res.status(200).json({ data: { name }, remaining: null });
    }

    // Claimed before generating, not after, so parallel requests can't all slip
    // through the cap. Refunded below if the generation itself fails.
    const remaining = await consumeQuota(uid);
    claimedFor = uid;

    // `op` and `parsed.data` are correlated at runtime by the `isAIOp` guard
    // and the matching `safeParse` above, but TS can't see that correlation
    // across the two separate expressions — hence the cast.
    type MeteredOp = Exclude<AIOp, 'daily-name'>;
    const data = await runPrompt(op as MeteredOp, parsed.data as AIOpInput<MeteredOp>);
    claimedFor = null;

    return res.status(200).json({ data, remaining });
  } catch (e) {
    if (claimedFor) await refundQuota(claimedFor);

    const status = (e as { status?: number }).status ?? 500;

    // Provider errors can carry response bodies with request echoes and key
    // hints. Log them server-side; return only a generic message to the client.
    if (status >= 500) {
      console.error('POST /api/ai failed:', e);
      return res.status(status).json({ error: 'AI request failed. Please try again.' });
    }

    return res.status(status).json({ error: (e as Error).message });
  }
}
