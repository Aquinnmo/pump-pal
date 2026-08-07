import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatch } from './_lib/router.js';

/**
 * The only serverless function in this deployment.
 *
 * Vercel counts each file under `api/` as a separate function and the Hobby
 * plan caps a deployment at 12; the real handlers therefore live under
 * `api/_lib/routes/` (not scanned) and `api/_lib/router.ts` maps paths onto
 * them. Public URLs are unchanged.
 *
 * This file is `index.ts`, not `[...path].ts`, and everything reaches it via
 * the explicit `/api/:path*` rewrite in vercel.json. As a bracket catch-all it
 * was only ever routed one segment deep in production: `/api/profile` was
 * dispatched but `/api/sync/manifest` got a platform 404 that never invoked the
 * function — invisible in the runtime logs, which is what made it survive.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await dispatch(req, res);
}
