import { createGoogle } from '@ai-sdk/google';
import { createProviderRegistry } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

export type AIProviderId = 'google';

export const AI_PROVIDER = process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'google';
export const AI_MODEL = process.env.EXPO_PUBLIC_AI_MODEL ?? 'gemini-3.5-flash';
export const AI_MAX_RETRIES = 2;

export const TEMPORARY_AI_DAILY_LIMIT = 3;

export function formatAIError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);

  const value = error as {
    message?: unknown;
    statusCode?: unknown;
    responseBody?: unknown;
    cause?: unknown;
  };
  const cause = value.cause instanceof Error ? value.cause.message : value.cause;
  const responseBody = typeof value.responseBody === 'string' ? value.responseBody.slice(0, 500) : value.responseBody;

  return [
    value.message,
    value.statusCode ? `status ${value.statusCode}` : undefined,
    responseBody ? `response ${responseBody}` : undefined,
    cause ? `cause ${String(cause)}` : undefined,
  ].filter(Boolean).join(' | ');
}

const googleProvider = createGoogle({
  apiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  // React Native's global fetch can expose a truncated `.` response body for
  // Google generation calls. Expo's native fetch implementation preserves the
  // response stream that AI SDK needs to parse.
  fetch: expoFetch as typeof fetch,
});

const providerRegistry = createProviderRegistry({ google: googleProvider });

export function getAIModel() {
  if (AI_PROVIDER !== 'google') {
    throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
  }

  return providerRegistry.languageModel(`google:${AI_MODEL}`);
}
