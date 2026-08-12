import assert from 'node:assert/strict';
import {
  FirestoreAuthError,
  FirestoreConflictError,
  FirestoreNetworkError,
  FirestoreNotFoundError,
  FirestorePermissionError,
  FirestoreRateLimitError,
  FirestoreValidationError,
  createFirestoreRestClient,
  type FirestoreClientDeps,
  type FirestoreFetch,
} from './firestore-rest-client-core';

type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> };

function response({ status, body, headers }: FakeResponse) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name: string) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null }, json: async () => body };
}

function client(fetchImpl: FirestoreFetch, getIdToken: FirestoreClientDeps['getIdToken'] = async () => 'id-token') {
  return createFirestoreRestClient({ projectId: 'demo', fetchImpl, getIdToken, getAppCheckToken: async () => 'app-check-token' });
}

async function main() {
  // Headers contain both Firebase credentials, but the transport never logs either token or a document body.
  {
    let headers: Record<string, string> | undefined;
    const logs: unknown[] = [];
    const rest = createFirestoreRestClient({
      projectId: 'demo',
      fetchImpl: async (_url, init) => { headers = init.headers; return response({ status: 200, body: { name: 'projects/demo/databases/(default)/documents/workouts/w1', updateTime: 'v1', fields: {} } }); },
      getIdToken: async () => 'id-token', getAppCheckToken: async () => 'app-check-token', log: (entry) => logs.push(entry),
    });
    const doc = await rest.getDocument('workouts/w1');
    assert.equal(doc?.version, 'v1');
    assert.deepEqual(headers, { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check-token' });
    assert.doesNotMatch(JSON.stringify(logs), /id-token|app-check-token/);
  }

  // A stale ID token refreshes once, then retries with the forced token.
  {
    const refreshes: boolean[] = [];
    let attempts = 0;
    const rest = client(async () => response({ status: ++attempts === 1 ? 401 : 200, body: { name: 'workouts/w1', updateTime: 'v2', fields: {} } }), async (force = false) => {
      refreshes.push(force); return force ? 'fresh' : 'stale';
    });
    assert.equal((await rest.getDocument('workouts/w1'))?.version, 'v2');
    assert.deepEqual(refreshes, [false, true]);
  }

  // Commit preserves update masks and currentDocument preconditions on the native REST wire.
  {
    let body: any;
    const rest = client(async (_url, init) => { body = JSON.parse(init.body!); return response({ status: 200, body: { writeResults: [{ updateTime: 'v3' }] } }); });
    assert.deepEqual(await rest.commit([{ path: 'workouts/w1', fields: { name: 'Push', reps: 8 }, updateMask: ['name', 'reps'], currentDocument: { updateTime: 'v2' } }]), [{ version: 'v3' }]);
    assert.deepEqual(body.writes[0].updateMask, { fieldPaths: ['name', 'reps'] });
    assert.deepEqual(body.writes[0].currentDocument, { updateTime: 'v2' });
    await assert.rejects(() => rest.commit([{ path: 'workouts/w1', fields: {} }]), FirestoreValidationError);
  }

  // Query bounds are local guardrails as well as Security Rules constraints.
  {
    const rest = client(async (_url, init) => response({ status: 200, body: [{ document: { name: 'workouts/w1', updateTime: 'v4', fields: {} } }] }));
    assert.equal((await rest.runQuery({ collectionId: 'workouts', limit: 1 })).length, 1);
    await assert.rejects(() => rest.runQuery({ collectionId: 'workouts', limit: 201 }), FirestoreValidationError);
  }

  assert.deepEqual(restDocumentReference(client(async () => response({ status: 200, body: {} }))), 'projects/demo/databases/(default)/documents/workouts/w1');

  for (const [status, ErrorType] of [[401, FirestoreAuthError], [403, FirestorePermissionError], [409, FirestoreConflictError], [429, FirestoreRateLimitError], [400, FirestoreValidationError], [500, FirestoreNetworkError]] as const) {
    const rest = client(async () => response({ status }));
    await assert.rejects(() => rest.getDocument('workouts/w1'), ErrorType);
  }
  const missing = client(async () => response({ status: 404 }));
  assert.equal(await missing.getDocument('workouts/missing'), undefined);
  await assert.rejects(() => missing.runQuery({ collectionId: 'workouts', limit: 1 }), FirestoreNotFoundError);
  await assert.rejects(() => client(async () => { throw new Error('offline'); }).getDocument('workouts/w1'), FirestoreNetworkError);

  console.log('firestore-rest-client: all assertions passed');
}

function restDocumentReference(rest: ReturnType<typeof createFirestoreRestClient>): string {
  return (rest.documentReference('workouts/w1') as { name: string }).name;
}

void main();
