import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

/**
 * Integration test for the Firestore REST adapter against a real wire
 * protocol shape (document names, `currentDocument` preconditions, 409s,
 * structured `:runQuery`) -- not against live Firestore (no network/service-
 * account access in this sandbox), but against a fake HTTP server standing
 * in for it via a mocked `global.fetch`. This is what actually exercises
 * ownership/conflict/idempotency end-to-end through the real store
 * functions (workouts.ts, injuries.ts), one layer below the HTTP/auth
 * concerns already covered by http.test.ts.
 */

// jose's importPKCS8 needs a real PKCS8 PEM -- generate one locally rather
// than faking the string, since rest.ts validates the PEM header/format.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = privateKey;

// ---------------------------------------------------------- fake Firestore

interface FakeDoc {
  fields: Record<string, unknown>;
  updateTime: string;
}
const fakeDb = new Map<string, FakeDoc>();
let tick = 0;
function nextUpdateTime(): string {
  tick += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, tick)).toISOString();
}

const DOC_NAME_PREFIX = 'projects/test-project/databases/(default)/documents/';

function decodeFirestoreValue(v: any): unknown {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ('mapValue' in v) return decodeFirestoreFields(v.mapValue.fields ?? {});
  throw new Error(`fake firestore: unhandled value ${JSON.stringify(v)}`);
}
function decodeFirestoreFields(fields: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeFirestoreValue(v)]));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const originalFetch = global.fetch;
global.fetch = (async (input: any, init: any) => {
  const url = String(input);

  if (url.includes('oauth2.googleapis.com/token')) {
    return jsonResponse({ access_token: 'fake-token', expires_in: 3600 });
  }

  if (url.endsWith(':commit')) {
    const body = JSON.parse(init.body);
    const writeResults: { updateTime?: string }[] = [];
    for (const w of body.writes) {
      if (w.delete) {
        const path = w.delete.replace(DOC_NAME_PREFIX, '');
        fakeDb.delete(path);
        writeResults.push({});
        continue;
      }
      const path = w.update.name.replace(DOC_NAME_PREFIX, '');
      const existing = fakeDb.get(path);

      if (w.currentDocument) {
        if ('exists' in w.currentDocument && w.currentDocument.exists === false && existing) {
          return jsonResponse({ error: { message: 'ALREADY_EXISTS' } }, 409);
        }
        if ('updateTime' in w.currentDocument && existing?.updateTime !== w.currentDocument.updateTime) {
          return jsonResponse({ error: { message: 'FAILED_PRECONDITION' } }, 409);
        }
      }

      const updateTime = nextUpdateTime();
      const newFields = decodeFirestoreFields(w.update.fields);
      fakeDb.set(path, { fields: { ...(existing?.fields ?? {}), ...newFields }, updateTime });
      writeResults.push({ updateTime });
    }
    return jsonResponse({ writeResults });
  }

  if (url.endsWith(':runQuery')) {
    const body = JSON.parse(init.body);
    const sq = body.structuredQuery;
    const collectionId = sq.from[0].collectionId;
    // parentPath is embedded in the request URL for subcollection queries.
    const parentPath = url.replace(/^.*\/documents\//, '').replace(':runQuery', '').replace(/\/$/, '');

    let rows = [...fakeDb.entries()].filter(([path]) => {
      const parts = path.split('/');
      const isTopLevel = parts.length === 2 && parts[0] === collectionId;
      const isUnderParent = parentPath && path.startsWith(`${parentPath}/${collectionId}/`);
      return isTopLevel || isUnderParent;
    });

    const filters = sq.where ? (sq.where.fieldFilter ? [sq.where.fieldFilter] : sq.where.compositeFilter.filters.map((f: any) => f.fieldFilter)) : [];
    for (const f of filters) {
      const field = f.field.fieldPath;
      const value = decodeFirestoreValue(f.value);
      rows = rows.filter(([, doc]) => doc.fields[field] === value);
    }

    if (sq.limit) rows = rows.slice(0, sq.limit);

    return jsonResponse(
      rows.map(([path, doc]) => ({
        document: {
          name: DOC_NAME_PREFIX + path,
          fields: encodeFirestoreFields(doc.fields),
          updateTime: doc.updateTime,
        },
      }))
    );
  }

  if (init?.method === 'DELETE') {
    const path = url.replace(/^.*\/documents\//, '');
    const existed = fakeDb.delete(path);
    return existed ? jsonResponse({}) : jsonResponse({}, 404);
  }

  // plain GET doc
  const path = url.replace(/^.*\/documents\//, '').split('?')[0];
  const doc = fakeDb.get(path);
  if (!doc) return jsonResponse({ error: { message: 'NOT_FOUND' } }, 404);
  return jsonResponse({ name: DOC_NAME_PREFIX + path, fields: encodeFirestoreFields(doc.fields), updateTime: doc.updateTime });
}) as typeof fetch;

function encodeFirestoreValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFirestoreFields(v as Record<string, unknown>) } };
  throw new Error(`fake firestore: unhandled value ${JSON.stringify(v)}`);
}
function encodeFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeFirestoreValue(v)]));
}

// ------------------------------------------------------------------- tests

const { createWorkout, updateWorkout, getOwnedWorkout, deleteWorkout } = await import('./workouts.js');

async function run() {
  // Create is idempotent: a retried POST with the same client id returns the
  // existing owned doc instead of erroring or duplicating.
  const created = await createWorkout('uid-1', {
    id: 'w1',
    name: 'Push Day',
    status: 'planned',
    performedExercises: [],
  });
  assert.equal(created.name, 'Push Day');
  assert.equal(created.status, 'planned');

  const retried = await createWorkout('uid-1', {
    id: 'w1',
    name: 'Push Day (different name, ignored)',
    status: 'in_progress',
    performedExercises: [],
  });
  assert.equal(retried.name, 'Push Day'); // unchanged -- the original create won, retry just acknowledged it
  assert.equal(retried.version, created.version);

  // Ownership: a different uid can't see uid-1's workout.
  const notOwned = await getOwnedWorkout('uid-2', 'w1').catch((e) => e);
  assert.equal(notOwned.status, 404);

  // Update with the correct baseVersion succeeds and returns a new version.
  const updated = await updateWorkout('uid-1', 'w1', { name: 'Renamed', baseVersion: created.version }, undefined);
  assert.equal(updated.conflict, false);
  if (!updated.conflict) {
    assert.equal(updated.workout.name, 'Renamed');
    assert.notEqual(updated.workout.version, created.version);
  }

  // A stale baseVersion returns a 409-shaped conflict with the CURRENT remote entity, not the caller's guess.
  const stale = await updateWorkout('uid-1', 'w1', { name: 'Stale write', baseVersion: created.version }, undefined);
  assert.equal(stale.conflict, true);
  if (stale.conflict) {
    assert.equal(stale.remote.name, 'Renamed'); // the real current state, not what the stale caller expected
  }

  // Delete is idempotent: deleting twice never errors the second time.
  await deleteWorkout('uid-1', 'w1');
  await deleteWorkout('uid-1', 'w1'); // no throw
  assert.equal(await getOwnedWorkout('uid-1', 'w1'), undefined);

  console.log('rest.integration: all assertions passed');
}

try {
  await run();
} finally {
  global.fetch = originalFetch;
}
