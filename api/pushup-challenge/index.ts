import type { VercelRequest, VercelResponse } from '@vercel/node';
import { putPushupChallengeInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { getChallenge, putChallenge } from '../_lib/store/pushup-challenge.js';

/**
 * GET /api/pushup-challenge -- current state (version: null when no active challenge)
 * PUT /api/pushup-challenge -- full desired-state replace, same semantics as the client's setDoc
 */
export default withRoute(['GET', 'PUT'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const challenge = await getChallenge(uid);
    return void res.status(200).json({ challenge });
  }

  const parsed = putPushupChallengeInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid pushup-challenge input: ${parsed.error.message}`);

  const result = await putChallenge(uid, parsed.data);
  // `=== true`, not truthiness: Vercel's builder compiles api/ with strict off,
  // where a boolean-literal discriminant only narrows on an explicit comparison.
  if (result.conflict === true) {
    return void res
      .status(409)
      .json({ error: 'Pushup challenge was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remote.version });
  }
  return void res.status(200).json({ challenge: result.challenge });
});
