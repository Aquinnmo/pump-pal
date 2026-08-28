import assert from 'node:assert/strict';
import { encodeFirestoreFields } from '@timber/contract/firestore';
import { exportPKCS8, generateKeyPair } from 'jose';
import { createWorkerApp, type WorkerBindings } from './worker.js';

const env: WorkerBindings = {
  FIREBASE_PROJECT_ID: 'demo',
  FIREBASE_CLIENT_EMAIL: 'worker@example.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----',
  API_ALLOWED_ORIGINS: 'https://timber-preview.adam-montgomery.ca',
};

const app = createWorkerApp(async (authorization) => {
  if (authorization === 'Bearer test') return 'verified-uid';
  throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
});

async function main() {
  const logged: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => { logged.push(args); };

  const health = await app.request('https://worker.example/health', undefined, env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const preflight = await app.request('https://worker.example/api/buddies', {
    method: 'OPTIONS', headers: { Origin: 'https://timber-preview.adam-montgomery.ca' },
  }, env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://timber-preview.adam-montgomery.ca');
  // Every header the client sends must be listed, or the browser blocks the real
  // request after this preflight succeeds — which is how X-Client-Version
  // (apps/mobile/src/lib/api-client-core.ts) took the whole web app's API down.
  assert.deepEqual(
    (preflight.headers.get('Access-Control-Allow-Headers') ?? '').split(',').map((header) => header.trim()),
    ['Content-Type', 'Authorization', 'X-Firebase-AppCheck', 'X-Client-Version']
  );

  const deniedOrigin = await app.request('https://worker.example/api/buddies', {
    method: 'OPTIONS', headers: { Origin: 'https://not-allowed.example' },
  }, env);
  assert.equal(deniedOrigin.status, 403);

  // Origin denial is the outermost guard: a hostile browser origin must not
  // reach token verification, and that rule includes the otherwise-public
  // health endpoint.
  const originProbeAuthCalls: string[] = [];
  const originProbeApp = createWorkerApp(async (authorization) => {
    originProbeAuthCalls.push(authorization ?? '');
    return 'origin-probe-uid';
  });
  const deniedApiRequest = await originProbeApp.request('https://worker.example/api/unknown', {
    headers: { Authorization: 'Bearer invalid', Origin: 'https://not-allowed.example' },
  }, env);
  assert.equal(deniedApiRequest.status, 403);
  assert.deepEqual(await deniedApiRequest.json(), { error: 'Origin not allowed', code: 'origin_denied' });
  const deniedHealthRequest = await originProbeApp.request('https://worker.example/health', {
    headers: { Origin: 'https://not-allowed.example' },
  }, env);
  assert.equal(deniedHealthRequest.status, 403);
  assert.deepEqual(await deniedHealthRequest.json(), { error: 'Origin not allowed', code: 'origin_denied' });
  assert.deepEqual(originProbeAuthCalls, [], 'bad Origin must precede auth on every path');

  // ID-token verification must happen before App Check verification, so an
  // invalid bearer token cannot be masked by (or trigger) App Check work.
  let appCheckCallsBeforeInvalidToken = 0;
  const invalidTokenProbeApp = createWorkerApp(
    async () => { throw Object.assign(new Error('Invalid or expired session'), { status: 401 }); },
    async () => {
      appCheckCallsBeforeInvalidToken += 1;
      return { verified: false, reason: 'invalid' };
    }
  );
  const invalidToken = await invalidTokenProbeApp.request('https://worker.example/api/unknown', {
    headers: {
      Authorization: 'Bearer invalid',
      'X-Firebase-AppCheck': 'app-check-sentinel',
      Origin: 'https://timber-preview.adam-montgomery.ca',
    },
  }, env);
  assert.equal(invalidToken.status, 401);
  assert.deepEqual(await invalidToken.json(), { error: 'Invalid or expired session' });
  assert.equal(appCheckCallsBeforeInvalidToken, 0, 'invalid ID tokens must short-circuit before App Check');
  assert.equal(
    invalidToken.headers.get('Access-Control-Allow-Origin'),
    'https://timber-preview.adam-montgomery.ca',
    'auth errors must retain CORS headers'
  );

  // Native requests omit Origin. They remain allowed even when no browser
  // origins are configured, but must not receive browser CORS headers.
  const nativeProbeApp = createWorkerApp(async () => 'native-probe-uid', async () => ({ verified: true }));
  const nativeRequest = await nativeProbeApp.request('https://worker.example/api/unknown', {
    headers: { Authorization: 'Bearer native' },
  }, { ...env, API_ALLOWED_ORIGINS: undefined });
  assert.equal(nativeRequest.status, 404, 'native no-Origin requests must reach routing without an origin allowlist');
  for (const header of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Vary']) {
    assert.equal(nativeRequest.headers.get(header), null, `native requests must not receive ${header}`);
  }

  const unauthenticated = await app.request('https://worker.example/api/buddies?today=2026-08-12', undefined, env);
  assert.equal(unauthenticated.status, 401, 'all privileged routes derive uid from a verified token');

  // An error must keep its CORS headers. Without them the browser refuses to
  // read the response and reports a CORS failure, hiding the actual status and
  // message — every thrown ApiError becomes undiagnosable from the client.
  const unauthenticatedFromBrowser = await app.request('https://worker.example/api/buddies?today=2026-08-12', {
    headers: { Origin: 'https://timber-preview.adam-montgomery.ca' },
  }, env);
  assert.equal(unauthenticatedFromBrowser.status, 401);
  assert.equal(
    unauthenticatedFromBrowser.headers.get('Access-Control-Allow-Origin'),
    'https://timber-preview.adam-montgomery.ca',
    'error responses must carry CORS headers'
  );
  assert.deepEqual(await unauthenticatedFromBrowser.json(), { error: 'Invalid or expired session' });

  const badRequestFromBrowser = await app.request('https://worker.example/api/buddies?today=nonsense', {
    headers: { Authorization: 'Bearer test', Origin: 'https://timber-preview.adam-montgomery.ca' },
  }, env);
  assert.equal(badRequestFromBrowser.status, 400);
  assert.equal(
    badRequestFromBrowser.headers.get('Access-Control-Allow-Origin'),
    'https://timber-preview.adam-montgomery.ca'
  );

  const invalidAi = await app.request('https://worker.example/api/ai', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'not-an-operation' }),
  }, env);
  assert.equal(invalidAi.status, 400, 'schema validation happens before any provider call');

  const enforced = await app.request('https://worker.example/api/ai', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'not-an-operation' }),
  }, { ...env, APP_CHECK_MODE: 'enforce', FIREBASE_PROJECT_NUMBER: '123', APP_CHECK_ALLOWED_APP_IDS: '1:123:web:allowed' });
  assert.equal(enforced.status, 401, 'enforcement rejects a missing App Check token');

  // verifyAppCheckToken is a hard module import, so the only way to drive the
  // enforce SUCCESS path — the actual risk of turning enforce on, since it can
  // reject legitimate traffic — is through the verifyAppCheck seam.
  {
    const verifyUidStub = async (authorization: string | undefined) => {
      if (authorization === 'Bearer test') return 'verified-uid';
      throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
    };
    const passingAppCheck = async () => ({ verified: true, appId: '1:123:web:allowed' });
    const appWithVerifiedAppCheck = createWorkerApp(verifyUidStub, passingAppCheck);
    const verified = await appWithVerifiedAppCheck.request('https://worker.example/api/ai', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'not-an-operation' }),
    }, { ...env, APP_CHECK_MODE: 'enforce' });
    assert.equal(verified.status, 400, 'a verified App Check token reaches the route under enforce (schema validation, not a 401)');
  }

  {
    const verifyUidStub = async (authorization: string | undefined) => {
      if (authorization === 'Bearer test') return 'verified-uid';
      throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
    };
    const failingAppCheck = async () => ({ verified: false, reason: 'invalid' });
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    const appWithFailingAppCheck = createWorkerApp(verifyUidStub, failingAppCheck);
    const unverified = await appWithFailingAppCheck.request('https://worker.example/api/ai', {
      method: 'POST', headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
        Origin: 'https://timber-preview.adam-montgomery.ca',
      }, body: JSON.stringify({ op: 'not-an-operation' }),
    }, { ...env, APP_CHECK_MODE: 'enforce' });
    console.warn = originalWarn;
    assert.equal(unverified.status, 401, 'an unverified App Check token still 401s under enforce');
    assert.equal(
      unverified.headers.get('Access-Control-Allow-Origin'),
      'https://timber-preview.adam-montgomery.ca',
      'App Check errors must retain CORS headers'
    );
    const unverifiedBody = await unverified.json() as { error: string; code: string };
    assert.equal(unverifiedBody.code, 'app_check_failed');
    assert.equal(unverifiedBody.error, 'Invalid or missing App Check token');
    assert.equal('reason' in unverifiedBody, false, 'the failure reason must never leak into the response body');
    const warnLog = warnings.find(([event]) => event === '[worker] app-check-unverified')?.[1] as Record<string, unknown>;
    assert.equal(warnLog?.reason, 'invalid', 'the reason is logged server-side, which is the only place it belongs');
  }

  // Monitor mode records an App Check failure but allows the request to reach
  // routing. The diagnostic reason stays server-side and never enters a body.
  {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    const appWithMonitoringAppCheck = createWorkerApp(
      async () => 'monitor-uid',
      async () => ({ verified: false, reason: 'monitor-only-sentinel' })
    );
    const monitored = await appWithMonitoringAppCheck.request('https://worker.example/api/unknown', {
      headers: { Authorization: 'Bearer monitor' },
    }, { ...env, APP_CHECK_MODE: 'monitor' });
    console.warn = originalWarn;
    assert.equal(monitored.status, 404, 'monitor mode must pass an unverified request through to routing');
    assert.doesNotMatch(await monitored.text(), /monitor-only-sentinel/);
    const monitorLog = warnings.find(([event]) => event === '[worker] app-check-unverified')?.[1] as Record<string, unknown>;
    assert.equal(monitorLog?.reason, 'monitor-only-sentinel');
  }

  // A parsed request body, bearer token, and resolved UID are all deliberately
  // absent from request logs; use unique sentinels so this remains observable.
  {
    const loggingApp = createWorkerApp(async () => 'private-uid-sentinel', async () => ({ verified: true }));
    const loggedBody = 'request-body-sentinel';
    const loggedResponse = await loggingApp.request('https://worker.example/api/ai', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer bearer-token-sentinel',
        'Content-Type': 'application/json',
        Origin: 'https://timber-preview.adam-montgomery.ca',
      },
      body: JSON.stringify({ op: 'not-an-operation', loggedBody }),
    }, env);
    assert.equal(loggedResponse.status, 400);
    assert.doesNotMatch(JSON.stringify(logged), /bearer-token-sentinel|private-uid-sentinel|request-body-sentinel/);
  }

  // The six live buddy/history routes use the real store seams, so provide a
  // deterministic Firestore REST fixture rather than coupling this suite to a
  // network or to the store modules' implementation details.
  {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const routeEnv: WorkerBindings = {
      ...env,
      FIREBASE_PRIVATE_KEY: await exportPKCS8(privateKey),
    };
    const documentsUrl = 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents';
    const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const document = (path: string, fields: Record<string, unknown>, updateTime = '2026-08-27T00:00:00.000Z') => ({
      name: `${documentsUrl}/${path}`,
      fields: encodeFirestoreFields(fields),
      updateTime,
    });
    type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
    let firestoreHandler: FetchHandler = () => { throw new Error('Unexpected Firestore request'); };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: 'worker-route-test-token', expires_in: 3_600 });
      }
      return firestoreHandler(url, init);
    }) as typeof fetch;

    const routeApp = createWorkerApp(
      async (authorization) => {
        assert.equal(authorization, 'Bearer route-test');
        return 'caller';
      },
      async () => ({ verified: true })
    );
    const routeRequest = (path: string, init?: RequestInit) => routeApp.request(`https://worker.example${path}`, init, routeEnv);
    const callerEnabled = document('users/caller', { socialEnabled: true });
    const targetEnabled = document('users/target', { username: 'Target', socialEnabled: true });
    const friendship = (status: 'pending' | 'accepted', requestedBy = 'target') => document('friendships/caller_target', {
      users: ['caller', 'target'], status, requestedBy, lastChop: {},
    });
    const runQueryBody = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}')) as {
      structuredQuery?: { from?: { collectionId?: string }[] };
    };

    try {
      // Search has an intentional empty-query success path and returns the
      // relationship state alongside each matching username.
      firestoreHandler = async (url) => {
        if (url.startsWith(`${documentsUrl}/users/caller`)) return jsonResponse(callerEnabled);
        if (url.endsWith(':runQuery')) {
          return jsonResponse([{ document: document('users/target', { username: 'Target', usernameLower: 'ta', socialEnabled: true }) }]);
        }
        if (url.startsWith(`${documentsUrl}/friendships/caller_target`)) return jsonResponse(friendship('pending'));
        throw new Error(`Unexpected search fixture request: ${url}`);
      };
      assert.deepEqual(await (await routeRequest('/api/buddies/search', { headers: { Authorization: 'Bearer route-test' } })).json(), { results: [] });
      const search = await routeRequest('/api/buddies/search?q=ta', { headers: { Authorization: 'Bearer route-test' } });
      assert.equal(search.status, 200);
      assert.deepEqual(await search.json(), { results: [{ uid: 'target', username: 'Target', state: 'incoming' }] });

      // Missing uid is rejected by the route schema before the send-request
      // store call, preserving the route-specific 400 envelope.
      const malformedSend = await routeRequest('/api/buddies', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(malformedSend.status, 400);
      assert.deepEqual(await malformedSend.json(), { error: 'Invalid buddy request' });

      // Sending a request returns the outgoing state after checking both
      // caller and target participation and committing the friendship.
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/users/caller`)) return jsonResponse(callerEnabled);
        if (url.startsWith(`${documentsUrl}/users/target`)) return jsonResponse(targetEnabled);
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        throw new Error(`Unexpected send fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const sent = await routeRequest('/api/buddies', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'target' }),
      });
      assert.equal(sent.status, 200);
      assert.deepEqual(await sent.json(), { state: 'outgoing' });

      // The item action validates both the path uid and the literal accept
      // action, then returns the accepted relationship state.
      const malformedAccept = await routeRequest('/api/buddies/bad_uid', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }),
      });
      assert.equal(malformedAccept.status, 400);
      assert.deepEqual(await malformedAccept.json(), { error: 'Invalid buddy action' });
      const malformedAcceptBody = await routeRequest('/api/buddies/target', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject' }),
      });
      assert.equal(malformedAcceptBody.status, 400);
      assert.deepEqual(await malformedAcceptBody.json(), { error: 'Invalid buddy action' });
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/users/caller`)) return jsonResponse(callerEnabled);
        if (url.startsWith(`${documentsUrl}/friendships/caller_target`)) return jsonResponse(friendship('pending'));
        if (url.startsWith(`${documentsUrl}/users/target`)) return jsonResponse(targetEnabled);
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        throw new Error(`Unexpected accept fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const accepted = await routeRequest('/api/buddies/target', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }),
      });
      assert.equal(accepted.status, 200);
      assert.deepEqual(await accepted.json(), { state: 'buddies' });

      // Chopping records the action and reports delivery separately. A missing
      // push token is a successful chop with delivered=false.
      const malformedChop = await routeRequest('/api/buddies/bad_uid/chop', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ today: '2026-08-27' }),
      });
      assert.equal(malformedChop.status, 400);
      assert.deepEqual(await malformedChop.json(), { error: 'Invalid chop' });
      const malformedChopBody = await routeRequest('/api/buddies/target/chop', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ today: 'not-a-date' }),
      });
      assert.equal(malformedChopBody.status, 400);
      assert.deepEqual(await malformedChopBody.json(), { error: 'Invalid chop' });
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/users/caller?`)) return jsonResponse(callerEnabled);
        if (url.startsWith(`${documentsUrl}/users/caller`)) return jsonResponse(document('users/caller', { username: 'Caller' }));
        if (url.startsWith(`${documentsUrl}/friendships/caller_target`)) return jsonResponse(friendship('accepted'));
        if (url.endsWith(':runQuery')) return jsonResponse([]);
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        if (url.startsWith(`${documentsUrl}/users/target`)) return jsonResponse(targetEnabled);
        if (url.startsWith(`${documentsUrl}/users/target/private/notifications`)) return new Response('', { status: 404 });
        throw new Error(`Unexpected chop fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const chopped = await routeRequest('/api/buddies/target/chop', {
        method: 'POST', headers: { Authorization: 'Bearer route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ today: '2026-08-27' }),
      });
      assert.equal(chopped.status, 200);
      assert.deepEqual(await chopped.json(), { chopped: true, delivered: false });

      // Applying an injury first resolves the injury by id, then stamps only
      // workouts inside its date window and returns their ids.
      firestoreHandler = async (url, init) => {
        if (url.endsWith('/users/caller:runQuery')) {
          const query = runQueryBody(init);
          if (query.structuredQuery?.from?.[0]?.collectionId === 'injuries') {
            return jsonResponse([{ document: document('users/caller/injuries/injury-1', {
              id: 'injury-1', bodyPart: 'shoulder', severity: 'mild', status: 'ongoing', onsetDate: '2026-08-20T00:00:00.000Z', resolvedDate: null,
            }) }]);
          }
        }
        if (url.endsWith(':runQuery')) {
          return jsonResponse([{ document: document('workouts/w1', { userId: 'caller', date: '2026-08-22T12:00:00.000Z' }) }]);
        }
        if (url.startsWith(`${documentsUrl}/workouts/w1?`)) return jsonResponse(document('workouts/w1', { injuries: [] }));
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        throw new Error(`Unexpected apply fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const applied = await routeRequest('/api/injuries/injury-1/apply-to-history', { method: 'POST', headers: { Authorization: 'Bearer route-test' } });
      assert.equal(applied.status, 200);
      assert.deepEqual(await applied.json(), { affectedWorkoutIds: ['w1'] });

      // An absent injury id is the route's domain-level 404.
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=injuries`)) return new Response('', { status: 404 });
        if (url.endsWith('/users/caller:runQuery')) {
          const query = runQueryBody(init);
          if (query.structuredQuery?.from?.[0]?.collectionId === 'injuries') return jsonResponse([]);
        }
        if (url.endsWith(':runQuery')) return jsonResponse([]);
        throw new Error(`Unexpected missing-injury fixture request: ${url}`);
      };
      const missingInjury = await routeRequest('/api/injuries/missing/apply-to-history', { method: 'POST', headers: { Authorization: 'Bearer route-test' } });
      assert.equal(missingInjury.status, 404);
      assert.deepEqual(await missingInjury.json(), { error: 'Injury not found' });
      // Removal returns the ids whose injury array was updated.
      firestoreHandler = async (url, init) => {
        if (url.endsWith(':runQuery')) return jsonResponse([{ document: document('workouts/w2', { userId: 'caller', injuries: ['injury-1'] }) }]);
        if (url.startsWith(`${documentsUrl}/workouts/w2?`)) return jsonResponse(document('workouts/w2', { injuries: ['injury-1'] }));
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        throw new Error(`Unexpected remove fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const removed = await routeRequest('/api/injuries/injury-1/remove-from-history', { method: 'POST', headers: { Authorization: 'Bearer route-test' } });
      assert.equal(removed.status, 200);
      assert.deepEqual(await removed.json(), { affectedWorkoutIds: ['w2'] });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Remaining non-AI live routes use the real storage implementations. Keep
  // their network surface deterministic with a local Firestore REST fixture.
  {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const routeEnv: WorkerBindings = {
      ...env,
      FIREBASE_PRIVATE_KEY: await exportPKCS8(privateKey),
    };
    const documentsUrl = 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents';
    const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const document = (path: string, fields: Record<string, unknown>, updateTime = '2026-08-27T00:00:00.000Z') => ({
      name: `${documentsUrl}/${path}`,
      fields: encodeFirestoreFields(fields),
      updateTime,
    });
    type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
    let firestoreHandler: FetchHandler = () => { throw new Error('Unexpected Firestore request'); };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: 'worker-remaining-route-test-token', expires_in: 3_600 });
      }
      return firestoreHandler(url, init);
    }) as typeof fetch;

    const routeApp = createWorkerApp(
      async (authorization) => {
        assert.equal(authorization, 'Bearer remaining-route-test');
        return 'caller';
      },
      async () => ({ verified: true })
    );
    const routeRequest = (path: string, init?: RequestInit) => routeApp.request(`https://worker.example${path}`, init, routeEnv);
    const pendingExercise = {
      id: 'pending-my-exercise',
      name: 'My Exercise',
      normalizedName: 'my exercise',
      aliases: [],
      primaryMuscles: [],
      secondaryMuscles: [],
      movementPattern: '',
      equipment: [],
      bodyRegion: 'full_body',
      mechanics: 'compound',
      forceType: 'mixed',
      trackingModes: ['reps_weight'],
      variations: [],
      schemaVersion: 2,
      status: 'pending_review',
      createdBy: 'caller',
    };

    try {
      // Pending submissions validate the body before reserving an id, then
      // return the created exercise with HTTP 201 (not the usual 200).
      const malformedPending = await routeRequest('/api/catalog/pending', {
        method: 'POST', headers: { Authorization: 'Bearer remaining-route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '' }),
      });
      assert.equal(malformedPending.status, 400);
      assert.deepEqual(await malformedPending.json(), { error: 'Invalid pending exercise input' });
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/exercises/pending-my-exercise?`)) return new Response('', { status: 404 });
        if (url.endsWith(':commit')) return jsonResponse({ writeResults: [{}] });
        if (url.startsWith(`${documentsUrl}/exercises/pending-my-exercise`)) return jsonResponse(document('exercises/pending-my-exercise', pendingExercise));
        throw new Error(`Unexpected pending fixture request: ${url} ${String(init?.body ?? '')}`);
      };
      const pending = await routeRequest('/api/catalog/pending', {
        method: 'POST', headers: { Authorization: 'Bearer remaining-route-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ' My Exercise ' }),
      });
      assert.equal(pending.status, 201);
      assert.deepEqual(await pending.json(), { exercise: pendingExercise });

      // Account deletion reports all successful cleanup phases and counts the
      // canonical/legacy workout and friendship queries independently.
      const accountRunQueryDocs = (url: string, init?: RequestInit) => {
        const query = JSON.parse(String(init?.body ?? '{}')) as { structuredQuery?: { from?: { collectionId?: string }[] } };
        const collection = query.structuredQuery?.from?.[0]?.collectionId;
        if (url.includes('/users/caller:runQuery') && collection === 'workouts') {
          return [{ document: document('users/caller/workouts/legacy-1', { userId: 'caller' }) }];
        }
        if (url.includes('/users/caller:runQuery') && collection === 'injuries') {
          return [{ document: document('users/caller/injuries/injury-1', { id: 'injury-1' }) }];
        }
        if (collection === 'workouts') {
          return [
            { document: document('workouts/w1', { userId: 'caller' }) },
            { document: document('workouts/w2', { userId: 'caller' }) },
          ];
        }
        if (collection === 'friendships') {
          return [
            { document: document('friendships/caller_a', { users: ['caller', 'a'] }) },
            { document: document('friendships/caller_b', { users: ['caller', 'b'] }) },
          ];
        }
        throw new Error(`Unexpected account query: ${url} ${String(init?.body ?? '')}`);
      };
      let accountFailurePath: string | undefined;
      firestoreHandler = async (url, init) => {
        const method = init?.method ?? 'GET';
        if (method === 'DELETE') {
          if (accountFailurePath && url.endsWith(accountFailurePath)) return new Response('delete failed', { status: 500 });
          return new Response('', { status: 200 });
        }
        if (url.endsWith(':runQuery')) return jsonResponse(accountRunQueryDocs(url, init));
        if (url === `${documentsUrl}/users/caller`) return jsonResponse(document('users/caller', { usernameLower: 'caller' }));
        throw new Error(`Unexpected account fixture request: ${url}`);
      };
      const deleted = await routeRequest('/api/account/data', {
        method: 'DELETE', headers: { Authorization: 'Bearer remaining-route-test' },
      });
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), {
        deleted: { workouts: 2, legacyWorkouts: 1, pushupChallenge: true, friendships: 2, userDoc: true },
        partial: false,
      });

      // A failed cleanup phase is best-effort: the route remains 200 but
      // reports partial=true and leaves only that phase's count at zero.
      accountFailurePath = '/workouts/w2';
      const partialDeletion = await routeRequest('/api/account/data', {
        method: 'DELETE', headers: { Authorization: 'Bearer remaining-route-test' },
      });
      assert.equal(partialDeletion.status, 200);
      assert.deepEqual(await partialDeletion.json(), {
        deleted: { workouts: 0, legacyWorkouts: 1, pushupChallenge: true, friendships: 2, userDoc: true },
        partial: true,
      });

      // Quota first checks the account opt-in, then reads without claiming a
      // unit. Its response is the server-derived status, not a client-side
      // calculation.
      const today = new Date().toISOString().slice(0, 10);
      firestoreHandler = async (url) => {
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=aiEnabled`)) return jsonResponse(document('users/caller', { aiEnabled: true }));
        if (url.startsWith(`${documentsUrl}/users/caller/private/aiUsage`)) return jsonResponse(document('users/caller/private/aiUsage', { date: today, count: 3 }));
        throw new Error(`Unexpected quota fixture request: ${url}`);
      };
      const quota = await routeRequest('/api/ai/quota', { headers: { Authorization: 'Bearer remaining-route-test' } });
      assert.equal(quota.status, 200);
      assert.deepEqual(await quota.json(), { remaining: 7, limit: 10, date: today });
      firestoreHandler = async (url) => {
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=aiEnabled`)) return jsonResponse(document('users/caller', { aiEnabled: false }));
        throw new Error(`Unexpected disabled-quota fixture request: ${url}`);
      };
      const disabledQuota = await routeRequest('/api/ai/quota', { headers: { Authorization: 'Bearer remaining-route-test' } });
      assert.equal(disabledQuota.status, 403);
      assert.deepEqual(await disabledQuota.json(), { error: 'AI features are off for this account.', code: 'ai_disabled' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // AI route control flow is intentionally order-dependent. Keep these
  // assertions sequential and use a local Firestore/provider fixture so no
  // real model or quota document is touched.
  {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const routeEnv: WorkerBindings = {
      ...env,
      FIREBASE_PRIVATE_KEY: await exportPKCS8(privateKey),
      AI_PROVIDER: 'openai',
      AI_MODEL: 'test-model',
      OPENAI_API_KEY: 'test-key',
    };
    const documentsUrl = 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents';
    const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const document = (path: string, fields: Record<string, unknown>, updateTime = '2026-08-27T00:00:00.000Z') => ({
      name: `${documentsUrl}/${path}`,
      fields: encodeFirestoreFields(fields),
      updateTime,
    });
    type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
    let firestoreHandler: FetchHandler = () => { throw new Error('Unexpected AI route request'); };
    let providerCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: 'worker-ai-route-test-token', expires_in: 3_600 });
      }
      if (url.startsWith(documentsUrl)) return firestoreHandler(url, init);
      providerCalls += 1;
      throw new Error('provider-failure-sentinel');
    }) as typeof fetch;
    const routeApp = createWorkerApp(
      async (authorization) => {
        assert.equal(authorization, 'Bearer ai-route-test');
        return 'caller';
      },
      async () => ({ verified: true })
    );
    const routeRequest = (init: RequestInit) => routeApp.request('https://worker.example/api/ai', init, routeEnv);

    try {
      const unknownOp = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'unknown-operation' }),
      });
      assert.equal(unknownOp.status, 400);
      assert.deepEqual(await unknownOp.json(), { error: 'Unknown operation' });

      const invalidInput = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'split-names', input: { description: 42 } }),
      });
      assert.equal(invalidInput.status, 400);
      assert.deepEqual(await invalidInput.json(), { error: 'Invalid input for op "split-names"' });

      const disabledRequests: string[] = [];
      firestoreHandler = async (url) => {
        disabledRequests.push(url);
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=aiEnabled`)) {
          return jsonResponse(document('users/caller', { aiEnabled: false }));
        }
        throw new Error(`Unexpected disabled-AI request: ${url}`);
      };
      const malformedWhileDisabled = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'split-names', input: {} }),
      });
      assert.equal(malformedWhileDisabled.status, 400);
      assert.deepEqual(await malformedWhileDisabled.json(), { error: 'Invalid input for op "split-names"' });
      assert.deepEqual(disabledRequests, [], 'AI input parsing must precede the account opt-in check');
      const disabled = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'split-names', input: { description: 'push pull legs' } }),
      });
      assert.equal(disabled.status, 403);
      assert.deepEqual(await disabled.json(), { error: 'AI features are off for this account.', code: 'ai_disabled' });

      const today = new Date().toISOString().slice(0, 10);
      let dailyCommits = 0;
      firestoreHandler = async (url) => {
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=aiEnabled`)) return jsonResponse(document('users/caller', { aiEnabled: true }));
        if (url.startsWith(`${documentsUrl}/random/${today}?mask.fieldPaths=name`)) return jsonResponse(document(`random/${today}`, { name: 'Ada' }));
        if (url.startsWith(`${documentsUrl}/users/caller/private/aiUsage`)) return jsonResponse(document(`users/caller/private/aiUsage`, { date: today, count: 3 }));
        if (url.endsWith(':commit')) {
          dailyCommits += 1;
          return jsonResponse({ writeResults: [{}] });
        }
        throw new Error(`Unexpected daily-name request: ${url}`);
      };
      providerCalls = 0;
      const cachedDailyName = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'daily-name', input: {} }),
      });
      assert.equal(cachedDailyName.status, 200);
      assert.deepEqual(await cachedDailyName.json(), { data: { name: 'Ada' }, remaining: 7 });
      assert.equal(dailyCommits, 0, 'cached daily-name must not consume quota');
      assert.equal(providerCalls, 0, 'cached daily-name must not call the provider');

      let usageCount = 3;
      let quotaCommits = 0;
      firestoreHandler = async (url, init) => {
        if (url.startsWith(`${documentsUrl}/users/caller?mask.fieldPaths=aiEnabled`)) return jsonResponse(document('users/caller', { aiEnabled: true }));
        if (url.startsWith(`${documentsUrl}/users/caller/private/aiUsage`)) return jsonResponse(document(`users/caller/private/aiUsage`, { date: today, count: usageCount }));
        if (url.endsWith(':commit')) {
          quotaCommits += 1;
          const body = JSON.parse(String(init?.body ?? '{}')) as { writes?: { update?: { fields?: { count?: { integerValue?: string } } } }[] };
          const nextCount = body.writes?.[0]?.update?.fields?.count?.integerValue;
          if (nextCount) usageCount = Number(nextCount);
          return jsonResponse({ writeResults: [{}] });
        }
        throw new Error(`Unexpected provider-failure storage request: ${url}`);
      };
      providerCalls = 0;
      const originalError = console.error;
      console.error = () => {};
      const providerFailure = await routeRequest({
        method: 'POST', headers: { Authorization: 'Bearer ai-route-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'split-names', input: { description: 'push pull legs' } }),
      });
      console.error = originalError;
      assert.equal(providerFailure.status, 500);
      assert.deepEqual(await providerFailure.json(), { error: 'Internal error' });
      assert.ok(providerCalls > 0, 'valid AI input must reach the provider after quota claim');
      assert.equal(quotaCommits, 2, 'provider failure must refund the consumed quota unit');
      assert.equal(usageCount, 3, 'refund must restore the pre-request usage count');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const safeProfileField = await app.request('https://worker.example/api/profile', {
    method: 'PATCH', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ workoutSplit: { type: 'Upper / Lower', custom: null } }),
  }, env);
  assert.equal(safeProfileField.status, 410, 'the Worker tombstones safe Firestore mutations during cutover');
  assert.equal((await safeProfileField.json() as { code: string }).code, 'client_upgrade_required');

  // GET /api/profile is a tombstone, but PATCH /api/profile is still a live
  // privileged route for the username and device-token fields. Keep the
  // methods distinct: a malformed live request must be a 400, not the 410
  // response from the retired GET route.
  const liveProfile = await app.request('https://worker.example/api/profile', {
    method: 'PATCH', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: '{}',
  }, env);
  assert.equal(liveProfile.status, 400, 'PATCH /api/profile must win over the GET tombstone');
  assert.deepEqual(await liveProfile.json(), { error: 'Only username and Expo push-token updates are privileged.' });

  for (const path of ['/api/profile', '/api/workouts', '/api/workouts/w1', '/api/injuries', '/api/injuries/i1', '/api/catalog', '/api/pushup-challenge', '/api/sync/manifest']) {
    const retired = await app.request(`https://worker.example${path}`, { headers: { Authorization: 'Bearer test' } }, env);
    assert.equal(retired.status, 410, `${path} stays a stable upgrade tombstone`);
    assert.deepEqual(await retired.json(), {
      error: 'This operation moved to direct Firestore. Update the client.',
      code: 'client_upgrade_required',
    });
  }

  // app.all('/api/injuries/:id') is intentionally below both live history
  // operations. Their current implementation reaches the Firestore seam and
  // returns a generic 500 with this fixture's invalid service-account key;
  // the important routing invariant is that neither falls through to 410.
  const originalErrorForCollision = console.error;
  const originalInfoForCollision = console.info;
  console.error = () => {};
  console.info = () => {};
  const liveInjuryRoutes = [
    '/api/injuries/i1/apply-to-history',
    '/api/injuries/i1/remove-from-history',
  ];
  for (const path of liveInjuryRoutes) {
    const liveInjury = await app.request(`https://worker.example${path}`, {
      method: 'POST', headers: { Authorization: 'Bearer test' },
    }, env);
    assert.equal(liveInjury.status, 500, `${path} must win over /api/injuries/:id tombstone`);
    assert.deepEqual(await liveInjury.json(), { error: 'Internal error' });
  }
  console.error = originalErrorForCollision;
  console.info = originalInfoForCollision;

  console.info = originalInfo;
  const requestLog = logged.find(([event]) => event === '[worker] request')?.[1] as Record<string, unknown>;
  assert.equal(typeof requestLog.requestId, 'string');
  assert.equal(typeof requestLog.route, 'string');
  assert.equal(typeof requestLog.status, 'number');
  assert.equal(typeof requestLog.durationMs, 'number');
  assert.doesNotMatch(JSON.stringify(logged), /Bearer test|verified-uid|workoutSplit/);

  // A 5xx keeps its cause in the server log while the client body stays generic.
  {
    const errors: unknown[][] = [];
    const originalError = console.error;
    const originalInfoAgain = console.info;
    console.error = (...args: unknown[]) => { errors.push(args); };
    console.info = () => {};
    const failing = createWorkerApp(async () => { throw new Error('Missing required env var: AI_PROVIDER'); });
    const response = await failing.request('https://worker.example/api/ai', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: '{}',
    }, env);
    console.error = originalError;
    console.info = originalInfoAgain;
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal error' }, 'the cause never reaches the client');
    assert.match(JSON.stringify(errors), /Missing required env var: AI_PROVIDER/, 'the cause does reach the server log');
  }

  console.log('worker: auth, CORS, and route validation assertions passed');
}

void main();
