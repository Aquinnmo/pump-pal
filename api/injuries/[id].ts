import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateInjuryInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { deleteInjury, updateInjury } from '../_lib/store/injuries.js';

/**
 * PATCH  /api/injuries/:id  -- partial edit (e.g. resolve); baseVersion optional (see contract notes)
 * DELETE /api/injuries/:id  -- idempotent; does NOT unstamp history (see .../remove-from-history)
 */
export default withRoute(['PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  if (req.method === 'DELETE') {
    await deleteInjury(uid, id);
    return void res.status(204).end();
  }

  const parsed = updateInjuryInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid injury patch: ${parsed.error.message}`);

  const result = await updateInjury(uid, id, parsed.data);
  // `=== true`, not truthiness: Vercel's builder compiles api/ with strict off,
  // where a boolean-literal discriminant only narrows on an explicit comparison.
  if (result.conflict === true) {
    // The injury record itself isn't independently versioned (it's an array
    // element on the user doc) -- a conflict here means "the user doc moved
    // under you", so the caller should re-GET /api/injuries and retry.
    return void res
      .status(409)
      .json({ error: 'Profile was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remoteVersion });
  }
  return void res.status(200).json({ injury: result.injury, version: result.version });
});
