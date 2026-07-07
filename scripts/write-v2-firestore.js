#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const REPORT_FILE = path.join(ROOT, 'temp', 'v2-migration-report.json');
const USERS_FILE = path.join(ROOT, 'temp', 'v2-users.json');
const WORKOUTS_FILE = path.join(ROOT, 'temp', 'v2-workouts.json');
const EXERCISES_FILE = path.join(ROOT, 'temp', 'v2-exercises.json');
const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const COMMIT_LIMIT = 450;

loadDotEnv(path.join(ROOT, '.env'));

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const report = readJson(REPORT_FILE);
  if (!report.passed) {
    throw new Error('Refusing to write v2 collections because temp/v2-migration-report.json did not pass.');
  }

  const projectId = requiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const accessToken = getAccessToken();
  const users = readJson(USERS_FILE).users || [];
  const workouts = readJson(WORKOUTS_FILE).workouts || [];
  const exercises = readJson(EXERCISES_FILE).exercises || [];
  const writes = [
    ...users.map((entry) => writeForPath(projectId, ['v2-users', entry.uid], entry.data)),
    ...workouts.map((entry) => writeForPath(projectId, ['v2-users', entry.uid, 'v2-workouts', entry.workoutId], entry.data)),
    ...exercises.map((entry) => writeForPath(projectId, ['v2-exercises', entry.exerciseId], entry.data)),
  ];

  if (writes.length === 0) {
    throw new Error('No v2 artifact documents found to write.');
  }

  for (let i = 0; i < writes.length; i += COMMIT_LIMIT) {
    const batch = writes.slice(i, i + COMMIT_LIMIT);
    await commitWrites(projectId, accessToken, batch);
    console.log(`Committed ${Math.min(i + COMMIT_LIMIT, writes.length)} of ${writes.length} v2 documents.`);
  }

  console.log(`Wrote ${users.length} users, ${workouts.length} workouts, and ${exercises.length} exercises to v2 collections.`);
}

function writeForPath(projectId, pathSegments, data) {
  return {
    update: {
      name: `${documentRoot(projectId)}/${encodePathSegments(pathSegments)}`,
      fields: encodeFields(data),
    },
  };
}

async function commitWrites(projectId, accessToken, writes) {
  const response = await fetch(`${FIRESTORE_API}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore commit failed: ${response.status} ${body}`);
  }
}

function encodeFields(value) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, encodeValue(key, entry)])
  );
}

function encodeValue(key, value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') {
    return shouldEncodeAsTimestamp(key, value) ? { timestampValue: value } : { stringValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((entry) => encodeValue('', entry)) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } };
  }
  return { stringValue: String(value) };
}

function shouldEncodeAsTimestamp(key, value) {
  if (!['date', 'updatedAt', 'migratedAt'].includes(key)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function documentRoot(projectId) {
  return `projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

function encodePathSegments(pathSegments) {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
}

function getAccessToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) {
    return process.env.FIREBASE_ACCESS_TOKEN;
  }

  const loginList = runFirebaseLoginList();
  const account = loginList.result?.find((entry) => entry.tokens?.access_token);

  if (!account) {
    throw new Error('No Firebase CLI access token found. Run "firebase login" or set FIREBASE_ACCESS_TOKEN.');
  }

  return account.tokens.access_token;
}

function runFirebaseLoginList() {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'powershell.exe' : 'firebase';
  const args = isWindows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'firebase login:list --json']
    : ['login:list', '--json'];

  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const detail = error.stderr ? `\n${error.stderr.toString()}` : '';
    throw new Error(`Could not read Firebase CLI login state.${detail}`);
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relative(filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return process.env[name];
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}
