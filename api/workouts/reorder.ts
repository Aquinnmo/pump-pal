import type { VercelRequest, VercelResponse } from '@vercel/node';
import { reorderWorkoutsInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { reorderWorkouts } from '../_lib/store/workouts.js';

/** PATCH /api/workouts/reorder -- bulk queueOrder update, e.g. from the planned-workouts screen. */
export default withRoute(['PATCH'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = reorderWorkoutsInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid reorder input: ${parsed.error.message}`);

  await reorderWorkouts(uid, parsed.data.order);
  return void res.status(204).end();
});
