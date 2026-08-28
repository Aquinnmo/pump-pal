import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import { setAppCheckTokenProvider } from './app-check-token';
import { FirestoreAuthError, type FirestoreFetch } from './firestore-rest-client-core';

type FirebaseAuthState = { token: string | null; forceRefresh: boolean[] };
const authState: FirebaseAuthState = { token: 'id-token', forceRefresh: [] };
const firebaseMock = () => ({
  auth: {
    get currentUser() {
      if (authState.token === null) return null;
      return {
        getIdToken: async (forceRefresh = false) => {
          authState.forceRefresh.push(forceRefresh);
          return authState.token;
        },
      };
    },
  },
});
// The mobile preload resolves this alias to the web platform file; register
// both explicit files so native and web wrapper imports share the fixture.
mock.module(new URL('../config/firebase.ts', import.meta.url).pathname, firebaseMock);
mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, firebaseMock);

type RequestRecord = { url: string; init: Parameters<FirestoreFetch>[1] };
let requests: RequestRecord[] = [];
let responseQueue: { status: number; body?: unknown }[] = [];

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_name: string) => null },
    json: async () => body,
  };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  requests.push({
    url: String(input),
    init: init as Parameters<FirestoreFetch>[1],
  });
  const next = responseQueue.shift() ?? { status: 200, body: {} };
  return response(next.status, next.body) as Response;
}) as typeof fetch;

setAppCheckTokenProvider(async () => 'app-check-token');

const native = await import(new URL('./firestore-rest-client.ts', import.meta.url).pathname);
const web = await import(new URL('./firestore-rest-client.web.ts', import.meta.url).pathname);
const clients = [
  ['native', native.firestoreRestClient],
  ['web', web.firestoreRestClient],
] as const;

try {
  // Both platform wrappers create the same shared REST client contract and
  // send equivalent authenticated requests through their platform transport.
  for (const [platform, makeClient] of clients) {
    requests = [];
    responseQueue = [{
      status: 200,
      body: {
        name: 'projects/pumppal-c9199/databases/(default)/documents/workouts/w1',
        updateTime: 'v1',
        fields: {},
      },
    }];
    const document = await makeClient().getDocument('workouts/w1');
    assert.equal(document?.version, 'v1', `${platform}: decodes a document response`);
    assert.equal(requests.length, 1, `${platform}: sends one document request`);
    assert.deepEqual(requests[0]?.init.headers, {
      Authorization: 'Bearer id-token',
      'X-Firebase-AppCheck': 'app-check-token',
    }, `${platform}: sends the shared credential headers`);
    assert.equal(requests[0]?.init.method, 'GET');
  }

  // A missing document is an ordinary undefined result for both wrappers.
  for (const [platform, makeClient] of clients) {
    responseQueue = [{ status: 404 }];
    assert.equal(await makeClient().getDocument('workouts/missing'), undefined, `${platform}: missing documents return undefined`);
  }

  // Both wrappers retain the shared stale-token retry contract, including a
  // forced refresh on the second auth lookup.
  authState.forceRefresh = [];
  for (const [platform, makeClient] of clients) {
    responseQueue = [{ status: 401 }, {
      status: 200,
      body: { name: 'workouts/w1', updateTime: `${platform}-v2`, fields: {} },
    }];
    assert.equal((await makeClient().getDocument('workouts/w1'))?.version, `${platform}-v2`, `${platform}: retries a stale token once`);
  }
  assert.deepEqual(authState.forceRefresh, [false, true, false, true], 'both wrappers force-refresh after a 401');

  // Missing auth fails before transport for both platform wrappers.
  authState.token = null;
  for (const [platform, makeClient] of clients) {
    const requestCount = requests.length;
    await assert.rejects(() => makeClient().getDocument('workouts/w1'), FirestoreAuthError, `${platform}: missing auth is rejected`);
    assert.equal(requests.length, requestCount, `${platform}: missing auth does not call fetch`);
  }

  console.log('firestore-rest-client parity: all assertions passed');
} finally {
  authState.token = 'id-token';
  setAppCheckTokenProvider(undefined);
  globalThis.fetch = originalFetch;
}
