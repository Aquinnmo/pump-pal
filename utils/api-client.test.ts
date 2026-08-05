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
          headers: { get: (k: string) => r.headers?.[k] ?? null },
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

  // --- 401: session expired ---
  {
    await assert.rejects(
      () => apiRequestCore('/api/x', deps(fakeFetch(() => ({ status: 401 })))),
      ApiAuthError
    );
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
        ...deps(fakeFetch(() => ({ status: 404 }))),
        log: (e) => entries.push(e),
      })
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 404);
    assert.equal(entries[0].error, 'ApiNotFoundError');
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

  console.log('utils/api-client.test.ts: all assertions passed');
}

main();
