import type { VercelRequest, VercelResponse } from '@vercel/node';
import { profilePatchInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { getProfile, updateProfile } from '../_lib/store/profile.js';

/**
 * GET   /api/profile -- current user's workoutSplit/aiUsage + version
 * PATCH /api/profile -- allowlisted fields only (workoutSplit); uid always
 *                        from the verified token, never the body
 */
export default withRoute(['GET', 'PATCH'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const profile = await getProfile(uid);
    return void res.status(200).json({ profile });
  }

  const parsed = profilePatchInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid profile patch: ${parsed.error.message}`);

  const result = await updateProfile(uid, parsed.data);
  if (result.conflict) {
    return void res
      .status(409)
      .json({ error: 'Profile was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remote.version });
  }
  return void res.status(200).json({ profile: result.profile });
});
