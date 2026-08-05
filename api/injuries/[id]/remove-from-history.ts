import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, withRoute } from '../../_lib/http.js';
import { removeInjuryFromHistory } from '../../_lib/store/injuries.js';

/**
 * POST /api/injuries/:id/remove-from-history -- unstamp this injury id from
 * every workout that carries it. No lookup against the live injury record
 * (unlike apply-to-history) since this must still work after the injury
 * itself has been deleted -- matching the client's current order of
 * operations (unstamp history, then delete the record). Idempotent.
 */
export default withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  const affectedWorkoutIds = await removeInjuryFromHistory(uid, id);
  return void res.status(200).json({ affectedWorkoutIds });
});
