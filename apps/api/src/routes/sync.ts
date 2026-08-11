import type { VercelRequest, VercelResponse } from '@vercel/node';
import { manifestQuery, pullRequest } from '@timber/contract/api';
import { ApiError, withRoute } from '../http.js';
import { getManifest, pull } from '../store/sync.js';

/**
 * GET /api/sync/manifest?cursor=&limit= -- authoritative {kind,id,version}
 * for every entity the caller owns, paginated. The native client diffs this
 * against its local store: ids present here with a newer version (or absent
 * locally) get pulled via POST /api/sync/pull; local ids absent here and
 * clean get deleted locally; dirty-and-absent become conflicts.
 */
export const manifest = withRoute(['GET'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = manifestQuery.safeParse({
    cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  if (!parsed.success) throw new ApiError(400, 'Invalid query');

  const result = await getManifest(uid, parsed.data);
  return void res.status(200).json(result);
});

/**
 * POST /api/sync/pull -- bounded (<=200 entities/call, enforced by the
 * shared schema) batch fetch of full entities by {kind,id}. Ownership-scoped:
 * requesting another user's workout id returns it in `missing`, not an
 * error and not the data -- existence isn't confirmed or denied either way.
 */
export const pullEntities = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = pullRequest.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid pull request: ${parsed.error.message}`);

  const result = await pull(uid, parsed.data);
  return void res.status(200).json(result);
});
