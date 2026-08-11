import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { isAIOp, AI_OPS, type AIOp, type AIOpInput } from '@timber/contract/ai';
import { requireUid } from '../auth.js';
import { AI_MODEL_INFO } from '../ai/model.js';
import { generateDailyName, runPrompt } from '../ai/prompts.js';
import { getCachedDailyName, setCachedDailyName } from '../store/daily-name.js';
import { consumeQuota, refundQuota } from '../store/quota.js';

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
export async function ai(req: VercelRequest, res: VercelResponse) {
  const requestId = randomUUID();
  const start = Date.now();
  let status = 500;
  let op: string | undefined;

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      status = 405;
      return void res.status(status).json({ error: 'Method not allowed' });
    }

    let claimedFor: string | null = null;

    try {
      const uid = await requireUid(req.headers.authorization);

      const body = (req.body ?? {}) as { op?: unknown; input?: unknown };
      if (!isAIOp(body.op)) {
        status = 400;
        return void res.status(status).json({ error: 'Unknown operation' });
      }
      op = body.op;

      const parsed = AI_OPS[body.op].input.safeParse(body.input ?? {});
      if (!parsed.success) {
        status = 400;
        return void res.status(status).json({ error: `Invalid input for op "${body.op}"` });
      }

      if (body.op === 'daily-name') {
        const cached = await getCachedDailyName();
        const name = cached ?? (await setCachedDailyName(await generateDailyName()));
        status = 200;
        return void res.status(status).json({ data: { name }, remaining: null });
      }

      // Claimed before generating, not after, so parallel requests can't all slip
      // through the cap. Refunded below if the generation itself fails.
      const remaining = await consumeQuota(uid);
      claimedFor = uid;

      // `op` and `parsed.data` are correlated at runtime by the `isAIOp` guard
      // and the matching `safeParse` above, but TS can't see that correlation
      // across the two separate expressions — hence the cast.
      type MeteredOp = Exclude<AIOp, 'daily-name'>;
      const data = await runPrompt(body.op as MeteredOp, parsed.data as AIOpInput<MeteredOp>);
      claimedFor = null;

      status = 200;
      return void res.status(status).json({ data, remaining });
    } catch (e) {
      if (claimedFor) await refundQuota(claimedFor);

      status = (e as { status?: number }).status ?? 500;

      // Provider errors can carry response bodies with request echoes and key
      // hints. Log them server-side; return only a generic message to the client.
      if (status >= 500) {
        console.error(`[${requestId}] POST /api/ai failed:`, e);
        return void res.status(status).json({ error: 'AI request failed. Please try again.' });
      }

      return void res.status(status).json({ error: (e as Error).message });
    }
  } finally {
    // Structured, redacted: never log the request body, the generated
    // output, or provider keys -- just enough to correlate a request with
    // provider spend and latency.
    console.log(
      JSON.stringify({
        requestId,
        route: '/api/ai',
        op,
        status,
        durationMs: Date.now() - start,
        provider: AI_MODEL_INFO.provider,
        model: AI_MODEL_INFO.model,
      })
    );
  }
}
