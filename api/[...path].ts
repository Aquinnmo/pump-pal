import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatch } from './_lib/router.js';

/**
 * The only serverless function in this deployment.
 *
 * Vercel counts each file under `api/` as a separate function and the Hobby
 * plan caps a deployment at 12; the real handlers therefore live under
 * `api/_lib/routes/` (not scanned) and `api/_lib/router.ts` maps paths onto
 * them. Public URLs are unchanged.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await dispatch(req, res);
}
