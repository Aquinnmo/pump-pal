import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry, defaultSettingsMiddleware, wrapLanguageModel } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

export type AIProviderId = 'google' | 'openai';

export const AI_PROVIDER = (process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'google') as AIProviderId;
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

const openaiProvider = createOpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  fetch: expoFetch as typeof fetch,
});

const providerRegistry = createProviderRegistry({ google: googleProvider, openai: openaiProvider });

// ponytail: hardcoded high effort, not an env var — nobody asked to tune this per-request yet.
// If that changes, add EXPO_PUBLIC_AI_REASONING_EFFORT and read it here instead.
const OPENAI_REASONING_EFFORT = 'high';

export function getAIModel() {
  if (AI_PROVIDER !== 'google' && AI_PROVIDER !== 'openai') {
    throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
  }

  const model = providerRegistry.languageModel(`${AI_PROVIDER}:${AI_MODEL}`);

  if (AI_PROVIDER === 'openai') {
    return wrapLanguageModel({
      model,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions: { openai: { reasoningEffort: OPENAI_REASONING_EFFORT } } },
      }),
    });
  }

  return model;
}
