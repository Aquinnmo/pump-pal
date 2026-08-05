import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, withRoute } from '../../_lib/http.js';
import { applyInjuryToHistory, listInjuries } from '../../_lib/store/injuries.js';

/** POST /api/injuries/:id/apply-to-history -- stamp this injury onto every workout in its onset/resolved window. Idempotent. */
export default withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  const { injuries } = await listInjuries(uid);
  const injury = injuries.find((i) => i.id === id);
  if (!injury) throw new ApiError(404, 'Injury not found');

  const affectedWorkoutIds = await applyInjuryToHistory(uid, injury);
  return void res.status(200).json({ affectedWorkoutIds });
});
