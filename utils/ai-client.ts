import { auth } from '@/config/firebase';
import type { AIOp, AIOpInput, AIResponse } from '@/shared/ai-contract';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { describeError } from './format-ai-error';

/**
 * Client for the `/api/ai` proxy.
 *
 * No provider API key exists on the device — generation happens server-side.
 * On web the app is served from the same Vercel origin as the function, so a
 * relative path works and no CORS is involved. Native builds need the absolute
 * deployment URL, which is not a secret.
 */
const BASE_URL = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_BASE_URL ?? '');

export async function callAI<Op extends AIOp>(
  op: Op,
  input: AIOpInput<Op> = {} as AIOpInput<Op>
): Promise<AIResponse<Op>> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to use AI features.');

  // A relative URL can only resolve in a browser. Off the web an unset base URL
  // surfaces as an opaque network failure, so name the actual cause instead.
  if (!BASE_URL && Platform.OS !== 'web') {
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

  const body = (await response.json().catch(() => null)) as
    | (AIResponse<Op> & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new Error(body?.error ?? `AI request failed (${response.status})`);
  }

  return body;
}

export { formatAIError } from './format-ai-error';
