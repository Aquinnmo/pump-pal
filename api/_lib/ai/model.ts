import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry, defaultSettingsMiddleware, wrapLanguageModel } from 'ai';

/**
 * Server-side model resolution. Deliberately reads NON-prefixed env vars: an
 * `EXPO_PUBLIC_` name would be inlined into the client bundle by Metro, which
 * is the leak this whole proxy exists to close.
 *
 * Unlike the old client version this does not pass `expo/fetch` — that
 * workaround existed because React Native's global fetch truncated Google
 * response bodies. Node's fetch does not.
 */
type AIProviderId = 'google' | 'openai';

const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'google') as AIProviderId;
const AI_MODEL = process.env.AI_MODEL ?? 'gemini-3.5-flash';

// ponytail: hardcoded high effort, not an env var — nobody asked to tune this per-request yet.
const OPENAI_REASONING_EFFORT = 'high';

const providerRegistry = createProviderRegistry({
  google: createGoogle({ apiKey: process.env.GEMINI_API_KEY ?? '' }),
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' }),
});

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
