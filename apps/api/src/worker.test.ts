import assert from 'node:assert/strict';
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
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'not-an-operation' }),
    }, { ...env, APP_CHECK_MODE: 'enforce' });
    console.warn = originalWarn;
    assert.equal(unverified.status, 401, 'an unverified App Check token still 401s under enforce');
    const unverifiedBody = await unverified.json() as { error: string; code: string };
    assert.equal(unverifiedBody.code, 'app_check_failed');
    assert.equal(unverifiedBody.error, 'Invalid or missing App Check token');
    assert.equal('reason' in unverifiedBody, false, 'the failure reason must never leak into the response body');
    const warnLog = warnings.find(([event]) => event === '[worker] app-check-unverified')?.[1] as Record<string, unknown>;
    assert.equal(warnLog?.reason, 'invalid', 'the reason is logged server-side, which is the only place it belongs');
  }

  const safeProfileField = await app.request('https://worker.example/api/profile', {
    method: 'PATCH', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ workoutSplit: { type: 'Upper / Lower', custom: null } }),
  }, env);
  assert.equal(safeProfileField.status, 410, 'the Worker tombstones safe Firestore mutations during cutover');
  assert.equal((await safeProfileField.json() as { code: string }).code, 'client_upgrade_required');

  for (const path of ['/api/profile', '/api/workouts', '/api/workouts/w1', '/api/injuries', '/api/injuries/i1', '/api/catalog', '/api/pushup-challenge', '/api/sync/manifest']) {
    const retired = await app.request(`https://worker.example${path}`, { headers: { Authorization: 'Bearer test' } }, env);
    assert.equal(retired.status, 410, `${path} stays a stable upgrade tombstone`);
    assert.equal((await retired.json() as { code: string }).code, 'client_upgrade_required');
  }

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
