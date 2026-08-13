import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai';
import { runtimeEnv } from '../runtime-env.js';

/**
 * Server-side model resolution. Deliberately reads NON-prefixed env vars: an
 * `EXPO_PUBLIC_` name would be inlined into the client bundle by Metro, which
 * is the leak this whole proxy exists to close.
 *
 * Provider, model, and reasoning effort are global server configuration —
 * clients choose an *operation* (packages/contract/src/ai-contract.ts), never a provider,
 * model, or effort. No silent defaults: AI_PROVIDER and AI_MODEL are
 * required; an unset or unsupported value fails at cold start with an
 * actionable message, not a guessed fallback at request time.
 *
 * Only the selected provider's SDK client is constructed, so only its API
 * key is read/required — the unselected provider's key is never touched.
 */

type AIProviderId = 'google' | 'openai';

/**
 * Portable reasoning-effort vocabulary. `provider-default` means "don't set
 * a reasoning option at all" (whatever the model does un-configured).
 * `max` is OpenAI-only (the OpenAI SDK's own type supports it; Google's
 * `thinkingLevel` tops out at `high`) — requesting it against `google` is a
 * config error, not a silent clamp to `high`.
 */
type ReasoningEffort = 'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const REASONING_EFFORTS: ReasoningEffort[] = [
  'provider-default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
const SUPPORTED_REASONING_BY_PROVIDER: Record<AIProviderId, ReasoningEffort[]> = {
  openai: ['provider-default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  // @ai-sdk/google's thinkingConfig.thinkingLevel only accepts these four;
  // 'none' maps to thinkingConfig.thinkingBudget: 0 instead (see below).
  google: ['provider-default', 'none', 'minimal', 'low', 'medium', 'high'],
};

function required(name: string): string {
  const value = runtimeEnv(name);
  if (!value) throw new Error(`Missing required env var: ${name}. Set it in the Worker or Vercel environment.`);
  return value;
}

const AI_PROVIDER_RAW = required('AI_PROVIDER');
if (AI_PROVIDER_RAW !== 'google' && AI_PROVIDER_RAW !== 'openai') {
  throw new Error(`Unsupported AI_PROVIDER "${AI_PROVIDER_RAW}". Must be "google" or "openai".`);
}
const AI_PROVIDER: AIProviderId = AI_PROVIDER_RAW;

const AI_MODEL = required('AI_MODEL');

const AI_REASONING_EFFORT_RAW = runtimeEnv('AI_REASONING_EFFORT') ?? 'provider-default';
if (!REASONING_EFFORTS.includes(AI_REASONING_EFFORT_RAW as ReasoningEffort)) {
  throw new Error(
    `Unsupported AI_REASONING_EFFORT "${AI_REASONING_EFFORT_RAW}". Must be one of: ${REASONING_EFFORTS.join(', ')}.`
  );
}
const AI_REASONING_EFFORT = AI_REASONING_EFFORT_RAW as ReasoningEffort;

if (!SUPPORTED_REASONING_BY_PROVIDER[AI_PROVIDER].includes(AI_REASONING_EFFORT)) {
  throw new Error(
    `AI_REASONING_EFFORT "${AI_REASONING_EFFORT}" is not supported by AI_PROVIDER "${AI_PROVIDER}". ` +
      `Supported for "${AI_PROVIDER}": ${SUPPORTED_REASONING_BY_PROVIDER[AI_PROVIDER].join(', ')}.`
  );
}

const baseModel =
  AI_PROVIDER === 'google'
    ? createGoogle({ apiKey: required('GEMINI_API_KEY') })(AI_MODEL)
    : createOpenAI({ apiKey: required('OPENAI_API_KEY') })(AI_MODEL);

function applyReasoning() {
  if (AI_REASONING_EFFORT === 'provider-default') return baseModel;

  if (AI_PROVIDER === 'openai') {
    return wrapLanguageModel({
      model: baseModel,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions: { openai: { reasoningEffort: AI_REASONING_EFFORT } } },
      }),
    });
  }

  // google: 'none' disables thinking via an explicit zero budget; the other
  // supported values map 1:1 onto thinkingLevel.
  const thinkingConfig =
    AI_REASONING_EFFORT === 'none'
      ? { thinkingBudget: 0 }
      : { thinkingLevel: AI_REASONING_EFFORT as 'minimal' | 'low' | 'medium' | 'high' };

  return wrapLanguageModel({
    model: baseModel,
    middleware: defaultSettingsMiddleware({ settings: { providerOptions: { google: { thinkingConfig } } } }),
  });
}

const resolvedModel = applyReasoning();

/** For structured logging only (api/ai.ts) -- never the key, just which provider/model/effort served the request. */
export const AI_MODEL_INFO = { provider: AI_PROVIDER, model: AI_MODEL, reasoningEffort: AI_REASONING_EFFORT };

export function getAIModel() {
  return resolvedModel;
}
