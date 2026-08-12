import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * model.ts validates AI_PROVIDER/AI_MODEL/AI_REASONING_EFFORT at *module
 * load* (cold start), so each scenario needs its own process with its own
 * env rather than re-importing the module in-process (Node module caching
 * would only ever run the top-level checks once).
 */

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), '_load-model.ts');

function tryLoad(env: Record<string, string | undefined>) {
  const result = spawnSync(process.execPath, [RUNNER], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ok: result.status === 0, stderr: result.stderr };
}

// Valid google config with no reasoning effort override loads cleanly.
{
  const r = tryLoad({
    AI_PROVIDER: 'google',
    AI_MODEL: 'gemini-3.5-flash',
    GEMINI_API_KEY: 'test-key',
    AI_REASONING_EFFORT: undefined,
    OPENAI_API_KEY: undefined,
  });
  assert.equal(r.ok, true, r.stderr);
}

// Missing AI_PROVIDER fails clearly, no silent default.
{
  const r = tryLoad({ AI_PROVIDER: undefined, AI_MODEL: 'gemini-3.5-flash', GEMINI_API_KEY: 'k' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Missing required env var: AI_PROVIDER/);
}

// Missing AI_MODEL fails clearly, no silent default.
{
  const r = tryLoad({ AI_PROVIDER: 'google', AI_MODEL: undefined, GEMINI_API_KEY: 'k' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Missing required env var: AI_MODEL/);
}

// Unsupported provider value.
{
  const r = tryLoad({ AI_PROVIDER: 'anthropic', AI_MODEL: 'x', GEMINI_API_KEY: 'k' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Unsupported AI_PROVIDER "anthropic"/);
}

// Unsupported reasoning effort value entirely.
{
  const r = tryLoad({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-5.6-luna', OPENAI_API_KEY: 'k', AI_REASONING_EFFORT: 'ultra' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Unsupported AI_REASONING_EFFORT "ultra"/);
}

// 'max' is OpenAI-only -- rejected against google, not silently clamped.
{
  const r = tryLoad({ AI_PROVIDER: 'google', AI_MODEL: 'gemini-3.5-flash', GEMINI_API_KEY: 'k', AI_REASONING_EFFORT: 'max' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /not supported by AI_PROVIDER "google"/);
}

// 'max' is accepted for openai.
{
  const r = tryLoad({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-5.6-luna', OPENAI_API_KEY: 'k', AI_REASONING_EFFORT: 'max' });
  assert.equal(r.ok, true, r.stderr);
}

// Missing the SELECTED provider's key fails clearly.
{
  const r = tryLoad({ AI_PROVIDER: 'google', AI_MODEL: 'gemini-3.5-flash', GEMINI_API_KEY: undefined });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Missing required env var: GEMINI_API_KEY/);
}

// The UNSELECTED provider's key is never required.
{
  const r = tryLoad({
    AI_PROVIDER: 'openai',
    AI_MODEL: 'gpt-5.6-luna',
    OPENAI_API_KEY: 'k',
    GEMINI_API_KEY: undefined,
  });
  assert.equal(r.ok, true, r.stderr);
}

console.log('model: all assertions passed');
