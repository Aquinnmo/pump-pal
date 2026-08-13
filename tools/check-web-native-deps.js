#!/usr/bin/env node
// Static, transitive check: none of the listed web-reachable entry points can
// reach a native-only package. Regex-based import BFS over the repo's own
// .ts/.tsx files (no bundler needed) — good enough to catch the mistake that
// matters (a web path accidentally importing a native db/*.ts file instead
// of its .web.ts sibling), not a full Metro resolution simulation.
const fs = require('node:fs');
const path = require('node:path');

// Resolves against the mobile app package: every entry point and every `@/`
// alias below is relative to it, not to the workspace root.
const ROOT = path.resolve(__dirname, '..', 'apps', 'mobile');

// Every package that only makes sense on-device — none of these may appear
// anywhere in a web bundle's import graph.
const FORBIDDEN_PACKAGES = [
  'expo-sqlite',
  '@react-native-community/netinfo',
  'expo-task-manager',
  'expo-background-task',
];

const ENTRY_POINTS = [
  'src/data/client.web.ts',
  'src/data/workout-repository.web.ts',
  'src/data/profile-repository.web.ts',
  'src/data/pushup-repository.web.ts',
  'src/data/catalog-repository.web.ts',
  'src/data/sync-trigger.web.ts',
  // Real app entry points that load on web too (Metro resolves their .ts
  // imports to .web.ts siblings automatically, same as ENTRY_POINTS above).
  'src/context/auth-context.tsx',
];

// An entry point that no longer exists makes this check pass without walking
// anything -- the failure mode a rename would otherwise introduce silently.
for (const entry of ENTRY_POINTS) {
  if (!fs.existsSync(path.join(ROOT, entry))) {
    console.error(`check-web-native-deps: entry point "${entry}" does not exist. Update ENTRY_POINTS.`);
    process.exit(1);
  }
}

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;

function resolveImport(fromFile, spec) {
  if (FORBIDDEN_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) return spec;
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null; // external package, not ours to walk

  // `@/*` maps to ["./src/*", "./*"] in apps/mobile/tsconfig.json — src/ first,
  // then the package root. Mirror both, in that order, or every `@/lib/...`
  // import resolves to nothing and the walk stops one hop in.
  const bases = spec.startsWith('@/')
    ? [path.join(ROOT, 'src', spec.slice(2)), path.join(ROOT, spec.slice(2))]
    : [path.join(path.dirname(fromFile), spec)];

  // Web platform resolution: prefer a .web.ts(x) sibling when walking from a
  // web entry point, exactly like Metro would for a web bundle.
  for (const base of bases) {
    const candidates = [
      `${base}.web.ts`,
      `${base}.web.tsx`,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, 'index.web.ts'),
      path.join(base, 'index.ts'),
    ];
    const hit = candidates.find((c) => fs.existsSync(c));
    if (hit) return hit;
  }
  return null;
}

function walk(entry) {
  const seen = new Set();
  const queue = [path.join(ROOT, entry)];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (FORBIDDEN_PACKAGES.includes(file)) {
      throw new Error(`${entry} transitively imports ${file}`);
    }
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) queue.push(resolved);
    }
  }
}

let failed = false;
for (const entry of ENTRY_POINTS) {
  try {
    walk(entry);
    console.log(`OK   ${entry}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${entry}: ${err.message}`);
  }
}
if (failed) process.exit(1);
console.log('tools/check-web-native-deps.js: no web entry point reaches a native-only package');
