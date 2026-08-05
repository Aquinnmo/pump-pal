import { errorResponse } from '@/shared/api-contract';
import { z } from 'zod';

/**
 * Platform-free request/error logic for the domain REST API client. Split
 * out of utils/api-client.ts so it never imports 'react-native'/'expo/fetch'
 * (which esbuild/tsx can't load outside Metro) and stays unit-testable — see
 * utils/api-client-core.test.ts. utils/api-client.ts is the thin wrapper
 * that supplies the real baseUrl/fetch/token for the app.
 */

export class ApiAuthError extends Error {
  constructor(message = 'You must be signed in.') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export class ApiValidationError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ApiValidationError';
  }
}

/** 409 — the mutation's baseVersion is stale. `remote`/`remoteVersion` let the caller rebase. */
export class ApiConflictError<T = unknown> extends Error {
  constructor(message: string, public remote: T, public remoteVersion: string) {
    super(message);
    this.name = 'ApiConflictError';
  }
}

export class ApiRateLimitError extends Error {
  /** Milliseconds to wait before retrying, parsed from `Retry-After`; null if the header was absent/unparseable. */
  constructor(message: string, public retryAfterMs: number | null) {
    super(message);
    this.name = 'ApiRateLimitError';
  }
}

export class ApiNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ApiNetworkError';
  }
}

export class ApiTimeoutError extends Error {
  constructor(message = 'Request timed out.') {
    super(message);
    this.name = 'ApiTimeoutError';
  }
}

export class ApiNotFoundError extends Error {
  constructor(message = 'Not found.') {
    super(message);
    this.name = 'ApiNotFoundError';
  }
}

/** Any other non-2xx status (500, ...), or a 2xx body that fails the caller's response schema. */
export class ApiHttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

export function buildQueryString(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Minimal shape both expo/fetch and the global fetch satisfy.
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export type ApiRequestOptions<TOut> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Validates + types the 2xx response body. Omit for endpoints with no body (e.g. 204). */
  responseSchema?: z.ZodType<TOut>;
  /** Validates + types a 409 response's `remote` entity, for ApiConflictError.remote. */
  conflictEntitySchema?: z.ZodType<unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ApiRequestDeps = {
  baseUrl: string;
  clientVersion: string;
  fetchImpl: FetchLike;
  getIdToken: () => Promise<string | null>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiRequestCore<TOut = void>(
  path: string,
  deps: ApiRequestDeps,
  options: ApiRequestOptions<TOut> = {}
): Promise<TOut> {
  const idToken = await deps.getIdToken();
  if (!idToken) throw new ApiAuthError();

  const url = `${deps.baseUrl}${path}${buildQueryString(options.query)}`;

  // Combine an internal timeout controller with any caller-supplied signal —
  // whichever fires first aborts the request.
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const onCallerAbort = () => timeoutController.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await deps.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Client-Version': deps.clientVersion,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeoutController.signal,
    });
  } catch (cause) {
    if (timeoutController.signal.aborted && !options.signal?.aborted) {
      throw new ApiTimeoutError();
    }
    if (options.signal?.aborted) {
      // Caller-initiated cancellation — surface as an abort, not a network error.
      const err = new Error('Request was cancelled.');
      err.name = 'AbortError';
      throw err;
    }
    throw new ApiNetworkError(`Could not reach ${url}.`, cause);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response.status === 401) {
    throw new ApiAuthError('Session expired — please sign in again.');
  }
  if (response.status === 404) {
    throw new ApiNotFoundError();
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as
      | { error?: unknown; remote?: unknown; remoteVersion?: string }
      | null;
    const remote = options.conflictEntitySchema
      ? options.conflictEntitySchema.parse(body?.remote)
      : body?.remote;
    throw new ApiConflictError(
      typeof body?.error === 'string' ? body.error : 'Version conflict.',
      remote,
      body?.remoteVersion ?? ''
    );
  }
  if (response.status === 429) {
    throw new ApiRateLimitError(
      'Rate limited — try again shortly.',
      parseRetryAfter(response.headers.get('Retry-After'))
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const parsed = errorResponse.safeParse(body);
    throw new ApiValidationError(
      parsed.success ? parsed.data.error : `Request failed (${response.status}).`,
      parsed.success ? parsed.data.code : undefined
    );
  }

  if (!options.responseSchema) return undefined as TOut;
  const body = await response.json().catch(() => null);
  const parsed = options.responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError(
      `Response did not match the expected shape: ${parsed.error.message}`,
      response.status
    );
  }
  return parsed.data;
}
