import type { VercelRequest, VercelResponse } from '@vercel/node';
import { profilePatchInput } from '../../../shared/api-contract.js';
import { ApiError, withRoute } from '../http.js';
import { getProfile, updateProfile } from '../store/profile.js';

/**
 * GET   /api/profile -- current user's workoutSplit/aiUsage + version
 * PATCH /api/profile -- allowlisted fields only (workoutSplit); uid always
 *                        from the verified token, never the body
 */
export const profile = withRoute(['GET', 'PATCH'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const result = await getProfile(uid);
    return void res.status(200).json({ profile: result });
  }

  const parsed = profilePatchInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid profile patch: ${parsed.error.message}`);

  const result = await updateProfile(uid, parsed.data);
  // `=== true`, not truthiness: Vercel's builder compiles api/ with strict off,
  // where a boolean-literal discriminant only narrows on an explicit comparison.
  if (result.conflict === true) {
    return void res
      .status(409)
      .json({ error: 'Profile was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remote.version });
  }
  return void res.status(200).json({ profile: result.profile });
});
