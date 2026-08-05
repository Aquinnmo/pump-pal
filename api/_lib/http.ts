import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { requireUid } from './auth.js';

/**
 * Shared request handling for every domain route under `api/`: CORS/
 * preflight, method allowlisting, bearer-token auth, a consistent error
 * envelope, a request id for correlating logs, and redacted structured
 * logging. `api/ai.ts` predates this and has its own inline handling (no
 * CORS needed there, same-origin only); new domain routes go through
 * `withRoute` instead of repeating this per file.
 *
 * Fails fast: required Firebase env vars are checked once at module load
 * (cold start), not deferred to the first request that happens to need them.
 */

function required(name: string): string {
  // Keep the dynamic lookup out of the client-only Expo env lint rule. This
  // runs in Vercel's server runtime, where the required-name list is internal.
  const environment: Record<string, string | undefined> = process.env;
  const value = environment[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

required('FIREBASE_PROJECT_ID');
required('FIREBASE_CLIENT_EMAIL');
required('FIREBASE_PRIVATE_KEY');

function allowedOrigins(): string[] {
  return (process.env.API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Sets CORS headers when the caller's Origin is on the allowlist, and
 * terminates the response for OPTIONS preflight. Requests with no Origin
 * header (native app, server-to-server) skip CORS entirely — same behavior
 * `api/ai.ts` already relies on for same-origin web + native calls.
 */
function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  const allowed = origin ? allowedOrigins().includes(origin) : false;

  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  }

  if (req.method === 'OPTIONS') {
    res.status(origin ? (allowed ? 204 : 403) : 204).end();
    return true;
  }

  return false;
}

export interface RouteContext {
  uid: string;
  requestId: string;
}

type Handler = (req: VercelRequest, res: VercelResponse, ctx: RouteContext) => Promise<void>;

/**
 * Wraps a domain route: CORS -> origin check -> method check -> auth ->
 * handler, with one error->envelope translation and one structured log line
 * per request. UID always comes from `requireUid` (the verified token) —
 * never trust a client-supplied uid in the body or path.
 */
export function withRoute(methods: string[], handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const start = Date.now();
    let status = 500;

    try {
      if (applyCors(req, res)) {
        status = res.statusCode;
        return;
      }

      const origin = req.headers.origin;
      if (origin && !allowedOrigins().includes(origin)) {
        throw new ApiError(403, 'Origin not allowed', 'origin_denied');
      }

      if (!req.method || !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new ApiError(405, 'Method not allowed', 'method_not_allowed');
      }

      const uid = await requireUid(req.headers.authorization);
      await handler(req, res, { uid, requestId });
      status = res.statusCode;
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError((e as { status?: number }).status ?? 500, (e as Error).message);
      status = err.status;
      // Errors can carry provider/DB response echoes; log server-side only,
      // return a generic message to the client for 5xx.
      if (status >= 500) console.error(`[${requestId}] unhandled error:`, e);
      res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message, code: err.code });
    } finally {
      // Structured, redacted: never log headers, body, or tokens.
      console.log(
        JSON.stringify({
          requestId,
          route: req.url,
          method: req.method,
          status,
          durationMs: Date.now() - start,
        })
      );
    }
  };
}
