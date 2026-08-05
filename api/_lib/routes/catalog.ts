import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPendingExerciseInput } from '../../../shared/api-contract.js';
import { ApiError, withRoute } from '../http.js';
import { createPendingExercise, getCatalog } from '../store/catalog.js';

/**
 * GET /api/catalog -- the full approved exercise catalog + its
 * cache-invalidation version. Public/global data (no per-user fields), safe
 * to cache client-side and keyed on `version`, same as the existing
 * AsyncStorage cache in utils/exercise-catalog.ts.
 */
export const catalog = withRoute(['GET'], async (_req: VercelRequest, res: VercelResponse) => {
  const result = await getCatalog();
  // Safe to cache at the edge/CDN too: identical for every caller, and
  // re-validated by `version` rather than a blind TTL.
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return void res.status(200).json(result);
});

/** POST /api/catalog/pending -- "can't find my exercise" submission. `createdBy` is always the verified uid, never accepted from the body. */
export const pending = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = createPendingExerciseInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid pending exercise input: ${parsed.error.message}`);

  const exercise = await createPendingExercise(uid, parsed.data.name);
  return void res.status(201).json({ exercise });
});
