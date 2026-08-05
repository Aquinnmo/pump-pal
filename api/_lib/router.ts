import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';

/**
 * Path -> handler table for the single catch-all function (`api/[...path].ts`).
 *
 * Vercel counts every file under `api/` as its own serverless function, and
 * the Hobby plan caps a deployment at 12. The handlers therefore live under
 * `api/_lib/routes/` (underscore-prefixed paths are not scanned) and this
 * table reproduces what filename-based routing used to do.
 *
 * Two properties this table has to preserve:
 *
 * - **Static before dynamic.** `/api/workouts/reorder` must be matched before
 *   `/api/workouts/:id`, or `reorder` gets parsed as a workout id. Same for
 *   `/api/catalog/pending` and the two `/api/injuries/:id/*-history` routes.
 *   Order in this array is the priority order; first match wins.
 * - **Lazy loading.** Each entry loads its module on demand rather than at
 *   module scope. One function otherwise means every request — including a
 *   plain workout GET — pays to evaluate the AI provider SDK at cold start.
 *
 * Method dispatch is deliberately *not* part of matching: each handler is
 * already wrapped in `withRoute([...])`, which owns the 405 + `Allow` header.
 * Routing on path alone keeps that behavior identical to filename routing.
 */

type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

interface Route {
  pattern: RegExp;
  load: () => Promise<RouteHandler>;
}

const ROUTES: Route[] = [
  { pattern: /^\/api\/ai$/, load: async () => (await import('./routes/ai.js')).ai },

  { pattern: /^\/api\/account\/data$/, load: async () => (await import('./routes/account.js')).data },

  // Static `/pending` before the bare collection is not strictly required
  // (they can't both match), but keeps the catalog pair read as one unit.
  { pattern: /^\/api\/catalog\/pending$/, load: async () => (await import('./routes/catalog.js')).pending },
  { pattern: /^\/api\/catalog$/, load: async () => (await import('./routes/catalog.js')).catalog },

  {
    pattern: /^\/api\/injuries\/([^/]+)\/apply-to-history$/,
    load: async () => (await import('./routes/injuries.js')).applyToHistory,
  },
  {
    pattern: /^\/api\/injuries\/([^/]+)\/remove-from-history$/,
    load: async () => (await import('./routes/injuries.js')).removeFromHistory,
  },
  { pattern: /^\/api\/injuries\/([^/]+)$/, load: async () => (await import('./routes/injuries.js')).item },
  { pattern: /^\/api\/injuries$/, load: async () => (await import('./routes/injuries.js')).collection },

  { pattern: /^\/api\/profile$/, load: async () => (await import('./routes/profile.js')).profile },

  {
    pattern: /^\/api\/pushup-challenge$/,
    load: async () => (await import('./routes/pushup-challenge.js')).pushupChallenge,
  },

  { pattern: /^\/api\/sync\/manifest$/, load: async () => (await import('./routes/sync.js')).manifest },
  { pattern: /^\/api\/sync\/pull$/, load: async () => (await import('./routes/sync.js')).pullEntities },

  // MUST precede /api/workouts/:id -- reorder is a PATCH, and so is the
  // item route, so a wrong order would silently treat it as id="reorder".
  { pattern: /^\/api\/workouts\/reorder$/, load: async () => (await import('./routes/workouts.js')).reorder },
  { pattern: /^\/api\/workouts\/([^/]+)$/, load: async () => (await import('./routes/workouts.js')).item },
  { pattern: /^\/api\/workouts$/, load: async () => (await import('./routes/workouts.js')).collection },
];

/** Strips the query string and any trailing slash. Exported for tests. */
export function normalizePath(url: string | undefined): string {
  const path = (url ?? '').split('?')[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The path to route on. `vercel.json` rewrites `/api/:path*` to
 * `/api?path=:path*`, so the segments arrive as a query param; `req.url` is
 * only trusted as a fallback because a rewrite may present the destination
 * rather than what the client asked for. Exported for tests.
 */
export function requestPath(req: Pick<VercelRequest, 'url' | 'query'>): string {
  const raw = req.query?.path;
  const joined = Array.isArray(raw) ? raw.join('/') : raw;
  if (!joined) return normalizePath(req.url);
  return normalizePath(`/api/${joined.replace(/^\/+/, '')}`);
}

export interface Match {
  route: Route;
  /** First capture group, when the pattern has one. Always the entity id here. */
  id?: string;
}

/** Pure: first matching route in table order, or undefined. Exported for tests. */
export function matchRoute(url: string | undefined): Match | undefined {
  const path = normalizePath(url);
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { route, id: match[1] };
  }
  return undefined;
}

export async function dispatch(req: VercelRequest, res: VercelResponse): Promise<void> {
  const path = requestPath(req);
  const match = matchRoute(path);
  if (!match) {
    // A miss never reaches withRoute, so without this line an unmatched path
    // produces *no* server-side output at all -- making "nothing in the logs"
    // ambiguous between "the request never arrived" and "the router rejected
    // it". Same JSON shape withRoute emits so both read alike in the stream.
    console.log(
      JSON.stringify({
        requestId: randomUUID(),
        route: path,
        method: req.method,
        status: 404,
        durationMs: 0,
        unmatched: true,
      })
    );
    // Same envelope withRoute produces, so utils/api-client.ts handles a
    // typo'd path the same way it handles any other 4xx.
    return void res.status(404).json({ error: 'Not found', code: 'not_found' });
  }

  if (match.id !== undefined) {
    // Filename routing (`api/workouts/[id].ts`) populated req.query.id; the
    // handlers still read it from there, so nothing below the router changed.
    req.query.id = decodeURIComponent(match.id);
  }

  const handler = await match.route.load();
  await handler(req, res);
}
