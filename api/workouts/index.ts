import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createWorkoutInput, listWorkoutsQuery } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { createWorkout, listWorkouts } from '../_lib/store/workouts.js';

/**
 * GET  /api/workouts?status=&cursor=&limit=   -- list, scoped to the caller's uid
 * POST /api/workouts                          -- create; body.id is client-supplied
 *                                                 for idempotent offline retries
 */
export default withRoute(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const parsed = listWorkoutsQuery.safeParse({
      status: req.query.status,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'Invalid query');

    const result = await listWorkouts(uid, parsed.data);
    return void res.status(200).json(result);
  }

  const parsed = createWorkoutInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid workout input: ${parsed.error.message}`);

  const workout = await createWorkout(uid, parsed.data);
  return void res.status(201).json({ workout });
});
