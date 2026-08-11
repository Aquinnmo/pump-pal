import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatch } from '../src/router.js';

/**
 * The only serverless function in this deployment, and the only file Vercel
 * treats as one: it counts each file under this package's `api/` directory as a
 * separate function, and the Hobby plan caps a deployment at 12. Everything
 * else lives under `src/`, which is outside that scan.
 *
 * Keep this file a thin adapter. All routing and handling is in `src/`, so the
 * platform-specific surface is one signature wide — that is what makes moving
 * this service to another host or framework a rewrite of this file alone.
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
