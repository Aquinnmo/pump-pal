import assert from 'node:assert/strict';
import { exportPKCS8, generateKeyPair } from 'jose';
import { commit, decodeFields, encodeFields, getDoc, runQuery, ts } from './rest.js';
import { configureRuntimeEnv } from '../runtime-env.js';

// Round-trip every value shape the domain routes need: string, integer,
// double, boolean, null, nested array, nested map, timestamp.
const input = {
  name: 'Bench Press',
  reps: 8,
  weight: 135.5,
  bodyweight: false,
  notes: null,
  tags: ['chest', 'push'],
  set: { setNumber: 1, reps: 8 },
  createdAt: ts('2026-08-05T12:00:00.000Z'),
};

const encoded = encodeFields(input);
assert.deepEqual(encoded.name, { stringValue: 'Bench Press' });
assert.deepEqual(encoded.reps, { integerValue: '8' });
assert.deepEqual(encoded.weight, { doubleValue: 135.5 });
assert.deepEqual(encoded.bodyweight, { booleanValue: false });
assert.deepEqual(encoded.notes, { nullValue: null });
assert.deepEqual(encoded.tags, { arrayValue: { values: [{ stringValue: 'chest' }, { stringValue: 'push' }] } });
assert.deepEqual(encoded.set, {
  mapValue: { fields: { setNumber: { integerValue: '1' }, reps: { integerValue: '8' } } },
});
assert.deepEqual(encoded.createdAt, { timestampValue: '2026-08-05T12:00:00.000Z' });

const decoded = decodeFields(encoded);
assert.deepEqual(decoded, {
  name: 'Bench Press',
  reps: 8,
  weight: 135.5,
  bodyweight: false,
  notes: null,
  tags: ['chest', 'push'],
  set: { setNumber: 1, reps: 8 },
  createdAt: '2026-08-05T12:00:00.000Z', // timestamps decode to the ISO string, not a Date/Timestamp
});

// The REST seam signs a JWT before the first Firestore request. Generate a
// disposable PKCS#8 key so these tests exercise the real auth path without
// carrying credentials in the repository.
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
process.env.FIREBASE_PRIVATE_KEY = await exportPKCS8(privateKey);
configureRuntimeEnv({
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const oauthUrl = 'https://oauth2.googleapis.com/token';
const documentsUrl = 'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents';
const firestoreRequests: { url: string; body: Record<string, any> }[] = [];
const firestoreResponses: Response[] = [];
let oauthRequestCount = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input, init) => {
  const url = String(input);
  if (url === oauthUrl) {
    oauthRequestCount += 1;
    return jsonResponse({ access_token: 'test-access-token', expires_in: 3_600 });
  }

  const body = init?.body === undefined ? {} : JSON.parse(String(init.body));
  firestoreRequests.push({ url, body });
  const response = firestoreResponses.shift();
  if (!response) throw new Error(`No stubbed Firestore response for ${url}`);
  return response;
}) as typeof fetch;

try {
  // A missing document is an ordinary absence, and field masks are encoded
  // as repeated query parameters. This first call also seeds the token cache.
  firestoreResponses.push(new Response('', { status: 404 }));
  assert.equal(await getDoc('users/missing', ['name', 'updatedAt']), undefined);
  assert.equal(
    firestoreRequests.at(-1)?.url,
    `${documentsUrl}/users/missing?mask.fieldPaths=name&mask.fieldPaths=updatedAt`,
  );
  assert.deepEqual(firestoreRequests.at(-1)?.body, {});
  assert.equal(oauthRequestCount, 1);

  // A non-empty update mask is carried through to the commit wire payload,
  // and the optimistic updateTime precondition is preserved unchanged.
  firestoreResponses.push(jsonResponse({ writeResults: [{ updateTime: '2026-08-08T00:00:00Z' }] }));
  const committed = await commit([
    {
      path: 'users/u1',
      fields: { displayName: 'Ada' },
      updateMask: ['displayName'],
      currentDocument: { updateTime: '2026-08-07T00:00:00Z' },
    },
  ]);
  assert.deepEqual(committed, [{ updateTime: '2026-08-08T00:00:00Z' }]);
  const maskedWrite = firestoreRequests.at(-1)?.body.writes[0];
  assert.equal(maskedWrite.update.name, 'projects/test-project/databases/(default)/documents/users/u1');
  assert.deepEqual(maskedWrite.update.fields, { displayName: { stringValue: 'Ada' } });
  assert.deepEqual(maskedWrite.updateMask, { fieldPaths: ['displayName'] });
  assert.deepEqual(maskedWrite.currentDocument, { updateTime: '2026-08-07T00:00:00Z' });
  // A valid cached token is reused across Firestore operations.
  assert.equal(oauthRequestCount, 1);

  // First-writer-wins creation uses the alternate precondition shape.
  firestoreResponses.push(jsonResponse({ writeResults: [{}] }));
  await commit([
    {
      path: 'users/new',
      fields: { displayName: 'Grace' },
      updateMask: ['displayName'],
      currentDocument: { exists: false },
    },
  ]);
  assert.deepEqual(firestoreRequests.at(-1)?.body.writes[0].currentDocument, { exists: false });

  // BUG: omitting updateMask is serialized as an empty field mask. The
  // Firestore REST contract treats this differently from a non-empty merge
  // mask, so this is the high-consequence document-replacement hazard.
  firestoreResponses.push(jsonResponse({ writeResults: [{}] }));
  await commit([{ path: 'users/u1', fields: { displayName: 'Lin' } }]);
  assert.deepEqual(firestoreRequests.at(-1)?.body.writes[0].updateMask, { fieldPaths: [] });

  // The adapter tags the documented 409 response so retry loops can detect a
  // precondition conflict.
  firestoreResponses.push(new Response('conflict', { status: 409 }));
  await assert.rejects(
    () => commit([{ path: 'users/u1', fields: {}, updateMask: [], currentDocument: { updateTime: 'stale' } }]),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 409);
      assert.match(String(error), /precondition failed/);
      return true;
    },
  );

  // BUG: Firestore reports a stale updateTime as HTTP 400
  // FAILED_PRECONDITION, but this adapter only tags HTTP 409; retry loops
  // therefore cannot recognize this equivalent failure shape.
  firestoreResponses.push(new Response('FAILED_PRECONDITION', { status: 400 }));
  await assert.rejects(
    () => commit([{ path: 'users/u1', fields: {}, updateMask: [], currentDocument: { updateTime: 'stale' } }]),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, undefined);
      assert.match(String(error), /Firestore commit failed: 400/);
      return true;
    },
  );

  // Structured query encoding covers the parent path, composite filters,
  // ordering defaults, positive limits, and exclusive cursors. Rows without a
  // document are protocol trailers and are intentionally filtered out.
  firestoreResponses.push(
    jsonResponse([
      {
        document: {
          name: `${documentsUrl}/users/u1/workouts/w1`,
          updateTime: '2026-08-08T01:00:00Z',
          fields: { score: { integerValue: '8' } },
        },
      },
      {},
    ]),
  );
  const queried = await runQuery({
    parentPath: 'users/u1',
    collectionId: 'workouts',
    where: [
      { field: 'status', op: 'EQUAL', value: 'completed' },
      { field: 'score', op: 'GREATER_THAN_OR_EQUAL', value: 5 },
    ],
    orderBy: [{ field: 'score' }, { field: 'createdAt', direction: 'DESCENDING' }],
    limit: 25,
    startAfter: ['completed', 5],
  });
  assert.deepEqual(queried, [
    {
      path: 'users/u1/workouts/w1',
      fields: { score: 8 },
      updateTime: '2026-08-08T01:00:00Z',
    },
  ]);
  const structuredQuery = firestoreRequests.at(-1)?.body.structuredQuery;
  assert.deepEqual(structuredQuery.from, [{ collectionId: 'workouts' }]);
  assert.deepEqual(structuredQuery.where, {
    compositeFilter: {
      op: 'AND',
      filters: [
        { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'completed' } } },
        { fieldFilter: { field: { fieldPath: 'score' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: '5' } } },
      ],
    },
  });
  assert.deepEqual(structuredQuery.orderBy, [
    { field: { fieldPath: 'score' }, direction: 'ASCENDING' },
    { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
  ]);
  assert.equal(structuredQuery.limit, 25);
  assert.deepEqual(structuredQuery.startAt, {
    values: [{ stringValue: 'completed' }, { integerValue: '5' }],
    before: false,
  });
  assert.equal(firestoreRequests.at(-1)?.url, `${documentsUrl}/users/u1:runQuery`);

  // BUG: limit: 0 is dropped by the truthiness guard, turning an explicit
  // zero-limit request into an unbounded query payload.
  firestoreResponses.push(jsonResponse([]));
  await runQuery({ collectionId: 'workouts', limit: 0 });
  assert.equal('limit' in (firestoreRequests.at(-1)?.body.structuredQuery ?? {}), false);
} finally {
  globalThis.fetch = originalFetch;
  configureRuntimeEnv(undefined);
}

console.log('rest: all assertions passed');
