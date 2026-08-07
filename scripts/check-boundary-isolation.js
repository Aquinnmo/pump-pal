#!/usr/bin/env node
/**
 * Two boundary rules `scripts/check-api-isolation.js` doesn't cover (that
 * one only checks relative-import direction, not *which packages*):
 *
 * 1. `api/**` never imports the `firebase` client SDK or `firebase-admin`.
 *    The proxy talks to Firestore over plain REST (`api/_lib/store/rest.ts`)
 *    + `jose` for both ID-token verification and the service-account OAuth2
 *    grant -- reintroducing either SDK is exactly the 16MB-dependency,
 *    cold-start regression `rest.ts`'s own header comment explains it
 *    replaced.
 * 2. No AI provider SDK (`ai`, `@ai-sdk/*`, `openai`) or provider API key
 *    env var (`GEMINI_API_KEY`, `OPENAI_API_KEY`) is referenced outside
 *    `api/**` -- that's the whole reason the proxy exists (CLAUDE.md: "No AI
 *    provider key exists on the client").
 *
 * Scoped to `api/`, `app/`, `components/`, `utils/`, `hooks/`, `context/`,
 * `config/` -- the runtime app tree. `scripts/migration/**` and
 * `wear/**` are excluded: the migration scripts run their own one-off
 * service-account auth (deliberately duplicated, not shared, per that
 * directory's own header comments) and the Wear OS module is a separate
 * native runtime with no Node import graph to check here.
 */
const { readdirSync, readFileSync } = require('node:fs');
const { join, resolve, relative } = require('node:path');

const ROOT = resolve(__dirname, '..');
const SCAN_DIRS = ['api', 'app', 'components', 'utils', 'hooks', 'context', 'config'];

const FORBIDDEN_IN_API = [/^firebase(\/|$)/, /^firebase-admin(\/|$)/];
const AI_PACKAGE_PATTERNS = [/^ai$/, /^@ai-sdk\//, /^openai$/, /^@google\/generative-ai$/];
const AI_ENV_VARS = ['GEMINI_API_KEY', 'OPENAI_API_KEY'];

function* sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const isApi = rel.startsWith('api' + require('node:path').sep) || rel === 'api';
    const source = readFileSync(file, 'utf8');

    for (const [, specifier] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('.')) continue; // relative imports are check-api-isolation.js's job

      if (isApi && FORBIDDEN_IN_API.some((re) => re.test(specifier))) {
        violations.push(`${rel} -> imports "${specifier}" (api/ must use api/_lib/store/rest.ts + jose, not the Firebase SDK)`);
      }
      if (!isApi && AI_PACKAGE_PATTERNS.some((re) => re.test(specifier))) {
        violations.push(`${rel} -> imports "${specifier}" (AI provider SDKs are server-only, must live under api/)`);
      }
    }

    if (!isApi) {
      for (const envVar of AI_ENV_VARS) {
        if (source.includes(envVar)) {
          violations.push(`${rel} -> references ${envVar} (provider keys are server-only, must live under api/)`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Boundary isolation violations:\n');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log('boundary-isolation: api/ never imports firebase/firebase-admin; no AI provider SDK or key outside api/');
