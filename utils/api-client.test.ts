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

  console.log('utils/api-client.test.ts: all assertions passed');
}

main();
