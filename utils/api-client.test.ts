import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  apiRequestCore,
  ApiAuthError,
  ApiConflictError,
  ApiRateLimitError,
  ApiTimeoutError,
  ApiNetworkError,
  ApiNotFoundError,
  ApiValidationError,
  ApiRequestDeps,
  ApiRequestLog,
  buildApiUrl,
  normalizeApiBaseUrl,
  FetchLike,
} from './api-client-core';

type FakeResponse = { status: number; headers?: Record<string, string>; body?: unknown };

// Mimics fetch's Response surface for the subset apiRequestCore uses, and
// aborts like real fetch does when the signal fires.
function fakeFetch(respond: (url: string, init: any) => FakeResponse | Promise<FakeResponse>): FetchLike {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      };
      if (init.signal.aborted) return onAbort();
      init.signal.addEventListener('abort', onAbort);
      Promise.resolve(respond(url, init)).then((r) => {
        init.signal.removeEventListener('abort', onAbort);
        resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          headers: {
            get: (name: string) =>
              Object.entries(r.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null,
          },
          json: async () => r.body,
        });
      });
    });
}

function deps(
  fetchImpl: FetchLike,
  getIdToken: () => Promise<string | null> = async () => 'fake-token'
): ApiRequestDeps {
  return { baseUrl: 'https://api.test', clientVersion: '1.0.0', fetchImpl, getIdToken };
}

const echoSchema = z.object({ ok: z.boolean() });

async function main() {
  // --- configured origins and same-origin fallback join paths consistently ---
  {
    const previewOrigin = normalizeApiBaseUrl(' https://timber-preview.example.com/// ');
    assert.equal(previewOrigin, 'https://timber-preview.example.com');
    assert.equal(buildApiUrl(previewOrigin, '/api/profile'), 'https://timber-preview.example.com/api/profile');
    assert.equal(buildApiUrl(previewOrigin, 'api/profile'), 'https://timber-preview.example.com/api/profile');
    assert.equal(buildApiUrl(normalizeApiBaseUrl(undefined), '/api/profile'), '/api/profile');
  }

  // --- success: response validated + typed against the schema ---
  {
    const result = await apiRequestCore(
      '/api/x',
      deps(fakeFetch(() => ({ status: 200, body: { ok: true } }))),
      { responseSchema: echoSchema }
    );
    assert.deepEqual(result, { ok: true });
  }

  // --- no signed-in user: never even reaches fetch ---
  {
    let fetchCalled = false;
    await assert.rejects(
      () =>
        apiRequestCore(
          '/api/x',
          deps(
            fakeFetch(() => {
              fetchCalled = true;
              return { status: 200 };
            }),
            async () => null
          )
        ),
      ApiAuthError
    );
    assert.equal(fetchCalled, false);
  }

  // --- 401: one forced token refresh and replay recovers a stale session ---
  {
    const refreshes: boolean[] = [];
    const tokens: string[] = [];
    let attempts = 0;
    const result = await apiRequestCore(
      '/api/x',
      deps(
        fakeFetch((_url, init) => {
          tokens.push(init.headers.Authorization);
          attempts += 1;
          return attempts === 1
            ? { status: 401, body: { error: 'Invalid or expired session', code: 'invalid_token' } }
            : { status: 200, body: { ok: true } };
        }),
        async (forceRefresh = false) => {
          refreshes.push(forceRefresh);
          return forceRefresh ? 'fresh-token' : 'stale-token';
        }
      ),
      { responseSchema: echoSchema }
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(refreshes, [false, true]);
    assert.deepEqual(tokens, ['Bearer stale-token', 'Bearer fresh-token']);
  }

  // --- second 401 surfaces the server diagnostics unchanged; no third attempt ---
  {
    let tokenCalls = 0;
    let fetchCalls = 0;
    await assert.rejects(
      () =>
        apiRequestCore(
          '/api/x',
          deps(
            fakeFetch(() => {
              fetchCalls += 1;
              return {
                status: 401,
                headers: { 'X-Request-Id': 'request-401' },
                body: { error: 'Invalid or expired session', code: 'invalid_token' },
              };
            }),
            async () => {
              tokenCalls += 1;
              return 'fake-token';
            }
          )
        ),
      (err: Error) => {
        assert.ok(err instanceof ApiAuthError);
        assert.equal(err.message, 'Invalid or expired session (401 from GET https://api.test/api/x)');
        assert.equal(err.code, 'invalid_token');
        assert.equal(err.requestId, 'request-401');
        return true;
      }
    );
    assert.equal(tokenCalls, 2);
    assert.equal(fetchCalls, 2);
  }

  // --- 404: distinct from a generic validation/http error ---
  {
    await assert.rejects(
      () => apiRequestCore('/api/x', deps(fakeFetch(() => ({ status: 404 })))),
      ApiNotFoundError
    );
  }

  // --- 409: structured conflict, not a generic exception ---
  {
    try {
      await apiRequestCore(
        '/api/x',
        deps(
          fakeFetch(() => ({
            status: 409,
            body: { error: 'stale', code: 'conflict', remote: { name: 'Server copy' }, remoteVersion: 'v9' },
          }))
        )
      );
      assert.fail('expected ApiConflictError');
    } catch (err) {
      assert.ok(err instanceof ApiConflictError);
      assert.deepEqual((err as ApiConflictError).remote, { name: 'Server copy' });
      assert.equal((err as ApiConflictError).remoteVersion, 'v9');
    }
  }

  // --- 429 with numeric Retry-After ---
  {
    try {
      await apiRequestCore(
        '/api/x',
        deps(fakeFetch(() => ({ status: 429, headers: { 'Retry-After': '2' } })))
      );
      assert.fail('expected ApiRateLimitError');
    } catch (err) {
      assert.ok(err instanceof ApiRateLimitError);
      assert.equal((err as ApiRateLimitError).retryAfterMs, 2000);
    }
  }

  // --- 429 with no Retry-After header ---
  {
    try {
      await apiRequestCore('/api/x', deps(fakeFetch(() => ({ status: 429 }))));
      assert.fail('expected ApiRateLimitError');
    } catch (err) {
      assert.equal((err as ApiRateLimitError).retryAfterMs, null);
    }
  }

  // --- validation error (400) surfaces the server's error/code ---
  {
    try {
      await apiRequestCore(
        '/api/x',
        deps(fakeFetch(() => ({ status: 400, body: { error: 'name is required', code: 'validation' } })))
      );
      assert.fail('expected ApiValidationError');
    } catch (err) {
      assert.ok(err instanceof ApiValidationError);
      assert.equal((err as ApiValidationError).message, 'name is required');
      assert.equal((err as ApiValidationError).code, 'validation');
    }
  }

  // --- non-401 response failures are not retried ---
  {
    let tokenCalls = 0;
    let fetchCalls = 0;
    await assert.rejects(
      () =>
        apiRequestCore(
          '/api/x',
          deps(
            fakeFetch(() => {
              fetchCalls += 1;
              return { status: 403, body: { error: 'Origin not allowed', code: 'origin_denied' } };
            }),
            async () => {
              tokenCalls += 1;
              return 'fake-token';
            }
          )
        ),
      ApiValidationError
    );
    assert.equal(tokenCalls, 1);
    assert.equal(fetchCalls, 1);
  }

  // --- network loss: fetch rejects with something other than AbortError ---
  {
    await assert.rejects(
      () =>
        apiRequestCore('/api/x', deps(() => Promise.reject(new Error('getaddrinfo ENOTFOUND')))),
      ApiNetworkError
    );
  }

  // --- timeout: fetch never resolves, internal timeout fires first ---
  {
    await assert.rejects(
      () =>
        apiRequestCore(
          '/api/x',
          deps(fakeFetch(() => new Promise(() => {}))), // never resolves
          { timeoutMs: 20 }
        ),
      ApiTimeoutError
    );
  }

  // --- cancellation: caller's AbortSignal wins over the (longer) timeout ---
  {
    const controller = new AbortController();
    const pending = apiRequestCore(
      '/api/x',
      deps(fakeFetch(() => new Promise(() => {}))),
      { timeoutMs: 5000, signal: controller.signal }
    );
    setTimeout(() => controller.abort(), 10);
    try {
      await pending;
      assert.fail('expected AbortError');
    } catch (err) {
      assert.equal((err as Error).name, 'AbortError');
    }
  }

  // --- 404 names the failing request ---
  // A bare "Not found." cost a real debugging session: it identified neither
  // the URL nor the method, so a route that was never deployed looked exactly
  // like an id that doesn't exist.
  {
    await assert.rejects(
      () => apiRequestCore('/api/sync/manifest', deps(fakeFetch(() => ({ status: 404 })))),
      (err: Error) => {
        assert.ok(err instanceof ApiNotFoundError);
        assert.match(err.message, /GET https:\/\/api\.test\/api\/sync\/manifest/);
        return true;
      }
    );
  }

  // --- 401 likewise ---
  {
    await assert.rejects(
      () => apiRequestCore('/api/profile', deps(fakeFetch(() => ({ status: 401 })))),
      (err: Error) => {
        assert.ok(err instanceof ApiAuthError);
        assert.match(err.message, /401 from GET https:\/\/api\.test\/api\/profile/);
        return true;
      }
    );
  }

  // --- log: exactly one entry per request, on success ---
  {
    const entries: ApiRequestLog[] = [];
    await apiRequestCore('/api/x', { ...deps(fakeFetch(() => ({ status: 200, body: { ok: true } }))), log: (e) => entries.push(e) }, { responseSchema: echoSchema });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].method, 'GET');
    assert.equal(entries[0].url, 'https://api.test/api/x');
    assert.equal(entries[0].status, 200);
    assert.equal(entries[0].error, undefined);
    assert.ok(typeof entries[0].durationMs === 'number');
    // Redaction: the token must never reach a log sink.
    assert.doesNotMatch(JSON.stringify(entries[0]), /fake-token|Authorization/i);
  }

  // --- log: failures carry the status and the error name ---
  {
    const entries: ApiRequestLog[] = [];
    await assert.rejects(() =>
      apiRequestCore('/api/x', {
        ...deps(
          fakeFetch(() => ({
            status: 404,
            headers: { 'X-Request-Id': 'request-404' },
            body: { error: 'Not found', code: 'not_found' },
          }))
        ),
        log: (e) => entries.push(e),
      })
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 404);
    assert.equal(entries[0].error, 'ApiNotFoundError');
    assert.equal(entries[0].code, 'not_found');
    assert.equal(entries[0].requestId, 'request-404');
    assert.doesNotMatch(JSON.stringify(entries[0]), /fake-token|Authorization/i);
  }

  // --- log: the second attempt's safe diagnostics are retained, never tokens ---
  {
    const entries: ApiRequestLog[] = [];
    let attempts = 0;
    await apiRequestCore(
      '/api/x',
      {
        ...deps(
          fakeFetch(() => {
            attempts += 1;
            return attempts === 1
              ? { status: 401, body: { error: 'Invalid or expired session', code: 'invalid_token' } }
              : { status: 200, headers: { 'X-Request-Id': 'request-ok' }, body: { ok: true } };
          })
        ),
        log: (entry) => entries.push(entry),
      },
      { responseSchema: echoSchema }
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 200);
    assert.equal(entries[0].requestId, 'request-ok');
    assert.equal(entries[0].retried, true);
    assert.doesNotMatch(JSON.stringify(entries[0]), /fake-token|Authorization/i);
  }

  // --- log: a request that never got a response has no status ---
  {
    const entries: ApiRequestLog[] = [];
    await assert.rejects(() =>
      apiRequestCore('/api/x', {
        ...deps(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))),
        log: (e) => entries.push(e),
      })
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, undefined);
    assert.equal(entries[0].error, 'ApiNetworkError');
  }

  // --- log: a missing ID token is logged too, not swallowed before logging ---
  {
    const entries: ApiRequestLog[] = [];
    await assert.rejects(() =>
      apiRequestCore('/api/x', {
        ...deps(fakeFetch(() => ({ status: 200 })), async () => null),
        log: (e) => entries.push(e),
      })
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].error, 'ApiAuthError');
    assert.equal(entries[0].status, undefined);
  }

  // --- fetchImpl is called as a free function, not as a method on deps ---
  // Web's `expo/fetch` export is the unbound `globalThis.fetch`; calling it as
  // `deps.fetchImpl(...)` binds `this` to the deps object and the browser throws
  // "Illegal invocation" before any request leaves the page.
  {
    let receiver: unknown = 'never called';
    const impl = function (this: unknown) {
      receiver = this;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true }),
      });
    } as unknown as FetchLike;
    const requestDeps = deps(impl);
    await apiRequestCore('/api/x', requestDeps, { responseSchema: echoSchema });
    assert.notEqual(receiver, requestDeps);
    assert.equal(receiver, undefined);
  }

  console.log('utils/api-client.test.ts: all assertions passed');
}

main();
