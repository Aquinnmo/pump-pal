#!/usr/bin/env node
/**
 * api/** may import only from api/ and shared/.
 *
 * That rule is what keeps the serverless proxy liftable into its own service:
 * the moment something in api/ reaches back into constants/ or utils/, the
 * directory stops being movable and the coupling grows back on the next edit.
 *
 * Resolves each relative specifier rather than pattern-matching "../../",
 * so it stays correct at any nesting depth.
 */
const { readdirSync, readFileSync } = require('node:fs');
const { join, resolve, dirname, relative, sep } = require('node:path');

const ROOT = resolve(__dirname, '..');
const ALLOWED = ['api', 'shared'];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

const violations = [];

for (const file of sourceFiles(join(ROOT, 'api'))) {
  const source = readFileSync(file, 'utf8');
  // `from '...'` covers both static imports and re-exports; require() is not
  // used in this tree.
  for (const [, specifier] of source.matchAll(/\bfrom\s+['"](\.[^'"]*)['"]/g)) {
    const target = relative(ROOT, resolve(dirname(file), specifier));
    const top = target.split(sep)[0];
    if (!ALLOWED.includes(top)) {
      violations.push(`${relative(ROOT, file)} -> ${specifier}  (resolves to ${target})`);
    }
  }
}

if (violations.length > 0) {
  console.error('api/ may import only from api/ and shared/. Violations:\n');
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nMove the value into shared/, or send it as request data.');
  process.exit(1);
}

console.log('api-isolation: api/ imports only from api/ and shared/');
