import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buddyActionInput, localDate, sendBuddyRequestInput } from '@timber/contract/api';
import { ApiError, withRoute } from '../http.js';
import { acceptBuddyRequest, listBuddies, searchUsers, sendBuddyRequest } from '../store/buddies.js';

/**
 * GET  /api/buddies/search?q=  -- username prefix search, annotated with the
 *                                 caller's relationship to each hit
 * GET  /api/buddies?today=     -- accepted buddies (streaks + chop state) and
 *                                 pending requests both ways
 * POST /api/buddies            -- send a request  { uid }
 * POST /api/buddies/:uid       -- { action: 'accept' }
 *
 * Chopping lives in `notifications.ts`, not here — see that file.
 */

export const search = withRoute(['GET'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const results = await searchUsers(uid, q ?? '');
  return void res.status(200).json({ results });
});

export const collection = withRoute(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const today = Array.isArray(req.query.today) ? req.query.today[0] : req.query.today;
    const parsedDay = localDate.safeParse(today);
    if (!parsedDay.success) throw new ApiError(400, 'today must be a YYYY-MM-DD local date');
    return void res.status(200).json(await listBuddies(uid, parsedDay.data));
  }

  const parsed = sendBuddyRequestInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid buddy request: ${parsed.error.message}`);

  return void res.status(200).json(await sendBuddyRequest(uid, parsed.data.uid));
});

export const item = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const targetUid = req.query.id as string;
  const parsed = buddyActionInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid buddy action: ${parsed.error.message}`);

  return void res.status(200).json(await acceptBuddyRequest(uid, targetUid));
});
