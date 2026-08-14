import { auth } from '@/config/firebase';
import type { AIOp, AIOpInput, AIResponse } from '@timber/contract/ai';
import { fetch as expoFetch } from 'expo/fetch';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { describeError } from './format-ai-error';
import { recordRemaining } from './ai-quota-cache';
import { normalizeApiBaseUrl } from './api-client-core';

/**
 * Client for the `/api/ai` proxy.
 *
 * No provider API key exists on the device — generation happens server-side.
 * A configured API origin is required on every platform, web included: the API
 * is its own Cloudflare Worker now, so there is no same-origin `/api/*` for a
 * web build to fall back to.
 */
const BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

/**
 * AI work is deliberately never queued.  A cached result remains useful while
 * offline, but a new generation would be paid work that cannot be completed
 * until there is a server connection.  Keeping this check at the one request
 * seam makes that invariant hold for every AI feature.
 */
export class AIOfflineError extends Error {
  constructor() {
    super('AI needs a connection. Cached results are still available.');
    this.name = 'AIOfflineError';
  }
}

/**
 * The daily quota is counted and enforced server-side (`apps/api/src/store/quota.ts`),
 * which answers with 429. Thrown as its own type so callers can tell "you are
 * out of uses" from "the request failed" — the two need different copy, and one
 * of them must not offer a retry.
 */
export class AIQuotaError extends Error {
  constructor(message?: string) {
    super(message || 'Sorry, you are out of insights for today.');
    this.name = 'AIQuotaError';
  }
}

async function assertAIConnectivity(): Promise<void> {
  if (Platform.OS === 'web') return;
  const state = await NetInfo.fetch();
  if (state.isConnected === false || state.isInternetReachable === false) {
    throw new AIOfflineError();
  }
}

export async function callAI<Op extends AIOp>(
  op: Op,
  input: AIOpInput<Op> = {} as AIOpInput<Op>
): Promise<AIResponse<Op>> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to use AI features.');

  await assertAIConnectivity();

  // An unset base URL surfaces as an opaque network failure (native) or a 404
  // against the web host itself (web), so name the actual cause instead.
  if (!BASE_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not set, so there is no /api/ai endpoint to call. ' +
        'Set it in .env (local) and in the EAS environment for this build profile.'
    );
  }

  const url = `${BASE_URL}/api/ai`;

  let response: Awaited<ReturnType<typeof expoFetch>>;
  try {
    response = await expoFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ op, input }),
    });
  } catch (cause) {
    // fetch rejects with wildly varying shapes across platforms; keep the URL
    // and the original value rather than letting it stringify to [object Object].
    throw new Error(`Could not reach ${url}: ${describeError(cause)}`, { cause });
  }

  // `error` is deliberately unknown, not string: our own function returns a
  // string, but a platform-level failure (an undeployed function, an auth wall)
  // returns Vercel's own `{ error: { code, message } }` shape. Passing that
  // object straight to `new Error()` stringifies it to "[object Object]" and
  // loses the one detail worth reading.
  const body = (await response.json().catch(() => null)) as
    | (AIResponse<Op> & { error?: unknown })
    | null;

  if (!response.ok || !body) {
    const detail = body?.error == null ? null : describeError(body.error);
    if (response.status === 429) {
      // 429 *is* the balance: the server refused because there is nothing left.
      recordRemaining(user.uid, 0);
      throw new AIQuotaError(detail ?? undefined);
    }
    throw new Error(
      detail
        ? `AI request failed (${response.status}): ${detail}`
        : `AI request failed (${response.status})`
    );
  }

  // Every /api/ai response carries `remaining`, including ops exempt from the
  // cap. Recording it here rather than at each call site means an op whose
  // caller ignores the count still refreshes the cached balance. (A Worker
  // deployed before that change sends null for exempt ops — not zero.)
  if (body.remaining != null) recordRemaining(user.uid, body.remaining);

  return body;
}

export { formatAIError } from './format-ai-error';
