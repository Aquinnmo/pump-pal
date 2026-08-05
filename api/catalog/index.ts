import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withRoute } from '../_lib/http.js';
import { getCatalog } from '../_lib/store/catalog.js';

/**
 * GET /api/catalog -- the full approved exercise catalog + its
 * cache-invalidation version. Public/global data (no per-user fields), safe
 * to cache client-side and keyed on `version`, same as the existing
 * AsyncStorage cache in utils/exercise-catalog.ts.
 */
export default withRoute(['GET'], async (_req: VercelRequest, res: VercelResponse) => {
  const catalog = await getCatalog();
  // Safe to cache at the edge/CDN too: identical for every caller, and
  // re-validated by `version` rather than a blind TTL.
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return void res.status(200).json(catalog);
});
