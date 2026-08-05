import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pullRequest } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { pull } from '../_lib/store/sync.js';

/**
 * POST /api/sync/pull -- bounded (<=200 entities/call, enforced by the
 * shared schema) batch fetch of full entities by {kind,id}. Ownership-scoped:
 * requesting another user's workout id returns it in `missing`, not an
 * error and not the data -- existence isn't confirmed or denied either way.
 */
export default withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = pullRequest.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid pull request: ${parsed.error.message}`);

  const result = await pull(uid, parsed.data);
  return void res.status(200).json(result);
});
