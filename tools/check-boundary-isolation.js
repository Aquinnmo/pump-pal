#!/usr/bin/env node
/**
 * Two dependency rules the workspace layout alone cannot enforce:
 *
 * 1. `apps/api/**` never imports the `firebase` client SDK or `firebase-admin`.
 *    It talks to Firestore over plain REST (`apps/api/src/store/rest.ts`) plus
 *    `jose` for both ID-token verification and the service-account OAuth2
 *    grant -- reintroducing either SDK is exactly the 16MB-dependency,
 *    cold-start regression `rest.ts`'s own header comment explains it
 *    replaced.
 * 2. No AI provider SDK (`ai`, `@ai-sdk/*`, `openai`) or provider API key
 *    env var (`GEMINI_API_KEY`, `OPENAI_API_KEY`) is referenced outside
 *    `apps/api/**` -- that's the whole reason the proxy exists (CLAUDE.md:
 *    "No AI provider key exists on the client").
 *
 * Both rules survive the workspace split for the same reason: package.json
 * declares intent, but the installer hoists every dependency into the
 * workspace-root `node_modules`, so a mobile file importing `ai` -- or an API
 * file importing `firebase` -- still resolves at build time even though
 * neither package declares it. Only this check fails on it.
 *
 * Import *direction* between packages needs no check: the Worker cannot reach
 * `apps/mobile` with a relative path, and does not depend on it.
 *
 * Scoped to `apps/api` plus the mobile app's runtime tree (see SCAN_DIRS).
 * `tools/**` and `apps/wear/**` are excluded: the catalog scripts run their own
 * service-account auth (deliberately duplicated, not shared, per that
 * directory's own header comments) and the Wear OS module is a separate native
 * runtime with no Node import graph to check here.
 */
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join, resolve, relative, sep } = require('node:path');

const ROOT = resolve(__dirname, '..');
// Workspace-root-relative. The mobile entries are the runtime app tree; the
// apps/api entries are the whole server tree. Both halves must be scanned by
// one run, because the two rules below are about what crosses between them.
const MOBILE = 'apps/mobile';
const API = 'apps/api';
const API_DIRS = [`${API}/src`];
const SCAN_DIRS = [
  ...API_DIRS,
  `${MOBILE}/app`,
  `${MOBILE}/src`,
  `${MOBILE}/widgets`,
];

// A directory that silently doesn't exist makes this whole check pass
// vacuously -- exactly what happened when the workspace split moved `api/` to
// `apps/api/` and this list still said `api`. Fail loudly instead.
for (const dir of SCAN_DIRS) {
  if (!existsSync(join(ROOT, dir))) {
    console.error(`boundary-isolation: scan directory "${dir}" does not exist. Update SCAN_DIRS.`);
    process.exit(1);
  }
}

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
    // Compare on the workspace path, not a bare "api" prefix: after the split
    // every server file is under apps/api/, and a stale prefix test here would
    // classify all of them as client code and flag their AI-SDK imports.
    const isApi = API_DIRS.some((d) => rel.startsWith(d.split('/').join(sep) + sep));
    const source = readFileSync(file, 'utf8');

    for (const [, specifier] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('.')) continue; // relative imports never cross a package boundary here

      if (isApi && FORBIDDEN_IN_API.some((re) => re.test(specifier))) {
        violations.push(`${rel} -> imports "${specifier}" (apps/api must use src/store/rest.ts + jose, not the Firebase SDK)`);
      }
      if (!isApi && AI_PACKAGE_PATTERNS.some((re) => re.test(specifier))) {
        violations.push(`${rel} -> imports "${specifier}" (AI provider SDKs are server-only, must live under apps/api)`);
      }
    }

    if (!isApi) {
      for (const envVar of AI_ENV_VARS) {
        if (source.includes(envVar)) {
          violations.push(`${rel} -> references ${envVar} (provider keys are server-only, must live under apps/api)`);
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

console.log('boundary-isolation: apps/api never imports firebase/firebase-admin; no AI provider SDK or key outside apps/api');
