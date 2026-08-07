import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chopInput } from '../../../shared/api-contract.js';
import { ApiError, withRoute } from '../http.js';
import { chopBuddy } from '../store/buddies.js';

/**
 * POST /api/buddies/:uid/chop -- the only route that sends a push.
 *
 * Kept out of `buddies.ts` so notification concerns stay in one file as more
 * of them appear. Note what the request body can *not* say: no title, no
 * body, no recipient beyond a uid the server then has to prove is an accepted
 * buddy. There is deliberately no generic "send a notification" endpoint —
 * that would be a spam relay with extra steps.
 */
export const chop = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const targetUid = req.query.id as string;
  const parsed = chopInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid chop: ${parsed.error.message}`);

  return void res.status(200).json(await chopBuddy(uid, targetUid, parsed.data.today));
});
