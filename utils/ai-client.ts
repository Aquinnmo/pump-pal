import { auth } from '@/config/firebase';
import type { AIOp, AIOpInput, AIResponse } from '@/shared/ai-contract';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

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

  const response = await expoFetch(`${BASE_URL}/api/ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ op, input }),
  });

  const body = (await response.json().catch(() => null)) as
    | (AIResponse<Op> & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new Error(body?.error ?? `AI request failed (${response.status})`);
  }

  return body;
}

/**
 * Formats an error from `callAI` for display. The proxy already sanitizes
 * provider responses, so this only has to unwrap the Error shape.
 */
export function formatAIError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return String(error);

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : String(error);
}
