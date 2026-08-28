#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CHECKER = path.join(__dirname, 'check-web-native-deps.js');
const ENTRY_POINTS = [
  'src/data/client.web.ts',
  'src/data/workout-repository.web.ts',
  'src/data/profile-repository.web.ts',
  'src/data/pushup-repository.web.ts',
  'src/data/catalog-repository.web.ts',
  'src/data/sync-trigger.web.ts',
  'src/context/auth-context.tsx',
];

function makeFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-web-native-deps-'));
  const appRoot = path.join(fixtureRoot, 'apps', 'mobile');
  fs.mkdirSync(path.join(fixtureRoot, 'tools'), { recursive: true });
  fs.copyFileSync(CHECKER, path.join(fixtureRoot, 'tools', 'check-web-native-deps.js'));
  for (const entry of ENTRY_POINTS) {
    const entryPath = path.join(appRoot, entry);
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(entryPath, 'export const fixture = true;\n');
  }
  return fixtureRoot;
}

function runChecker(fixtureRoot) {
  return spawnSync(
    process.execPath,
    [path.join(fixtureRoot, 'tools', 'check-web-native-deps.js')],
    { cwd: fixtureRoot, encoding: 'utf8' },
  );
}

function writeFixture(fixtureRoot, relativePath, source) {
  const absolutePath = path.join(fixtureRoot, 'apps', 'mobile', relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
}

function removeFixture(fixtureRoot, relativePath) {
  fs.unlinkSync(path.join(fixtureRoot, 'apps', 'mobile', relativePath));
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function entryPattern(prefix, entry) {
  const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${prefix}\\s+${escaped}`);
}

// Every configured entry point must exist and be walked. The output is also a
// useful contract: adding an entry point cannot silently become a no-op.
{
  const fixtureRoot = makeFixture();
  try {
    const result = runChecker(fixtureRoot);
    assertSuccess(result);
    for (const entry of ENTRY_POINTS) assert.match(result.stdout, entryPattern('OK', entry));
    assert.match(result.stdout, /no web entry point reaches a native-only package/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// A renamed/deleted configured entry point must fail closed instead of making
// the checker pass without walking that path.
{
  const fixtureRoot = makeFixture();
  try {
    removeFixture(fixtureRoot, 'src/data/catalog-repository.web.ts');
    const result = runChecker(fixtureRoot);
    assert.notEqual(result.status, 0, 'missing configured entry point was accepted');
    assert.match(result.stderr, /entry point "src\/data\/catalog-repository\.web\.ts" does not exist/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// The native-only package can be several hops away from an entry point; the
// import graph must not stop after checking only the entry file itself.
{
  const fixtureRoot = makeFixture();
  try {
    writeFixture(fixtureRoot, 'src/data/client.web.ts', "import first from '../lib/first';\nexport default first;\n");
    writeFixture(fixtureRoot, 'src/lib/first.ts', "import second from './second';\nexport default second;\n");
    writeFixture(fixtureRoot, 'src/lib/second.ts', "import sqlite from 'expo-sqlite';\nexport default sqlite;\n");
    const result = runChecker(fixtureRoot);
    assert.notEqual(result.status, 0, 'forbidden transitive import was accepted');
    assert.match(result.stderr, /FAIL src\/data\/client\.web\.ts/);
    assert.match(result.stderr, /transitively imports expo-sqlite/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// Web-specific siblings take precedence in the documented order: .web.ts,
// then .web.tsx, then the ordinary .ts fallback.
{
  const fixtureRoot = makeFixture();
  try {
    writeFixture(fixtureRoot, 'src/data/client.web.ts', "import platform from '../lib/platform';\nexport default platform;\n");
    writeFixture(fixtureRoot, 'src/lib/platform.web.ts', "import sqlite from 'expo-sqlite';\nexport default sqlite;\n");
    writeFixture(fixtureRoot, 'src/lib/platform.web.tsx', 'export default {};\n');
    writeFixture(fixtureRoot, 'src/lib/platform.ts', "import sqlite from 'expo-sqlite';\nexport default sqlite;\n");
    const webTsResult = runChecker(fixtureRoot);
    assert.notEqual(webTsResult.status, 0, '.web.ts did not win over .web.tsx');

    removeFixture(fixtureRoot, 'src/lib/platform.web.ts');
    assertSuccess(runChecker(fixtureRoot));

    removeFixture(fixtureRoot, 'src/lib/platform.web.tsx');
    const fallbackResult = runChecker(fixtureRoot);
    assert.notEqual(fallbackResult.status, 0, 'native fallback was not checked after web sibling removal');
    assert.match(fallbackResult.stderr, /FAIL src\/data\/client\.web\.ts/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// Each configured entry point must participate in the same transitive guard,
// including the context entry point outside src/data.
{
  const fixtureRoot = makeFixture();
  try {
    writeFixture(fixtureRoot, 'src/lib/forbidden.ts', "import sqlite from 'expo-sqlite';\nexport default sqlite;\n");
    for (const entry of ENTRY_POINTS) {
      writeFixture(fixtureRoot, entry, "import forbidden from '../lib/forbidden';\nexport default forbidden;\n");
    }
    const result = runChecker(fixtureRoot);
    assert.notEqual(result.status, 0, 'configured entry points did not reject forbidden imports');
    for (const entry of ENTRY_POINTS) assert.match(result.stderr, entryPattern('FAIL', entry));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

console.log('check-web-native-deps.test.js passed');
