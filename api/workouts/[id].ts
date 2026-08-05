import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateWorkoutInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { getOngoingInjuries } from '../_lib/store/profile.js';
import { deleteWorkout, getOwnedWorkout, toWorkoutDTO, updateWorkout } from '../_lib/store/workouts.js';

/**
 * GET    /api/workouts/:id
 * PATCH  /api/workouts/:id  -- versioned (baseVersion required); 409 on stale version
 * DELETE /api/workouts/:id  -- idempotent
 */
export default withRoute(['GET', 'PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing workout id');

  if (req.method === 'GET') {
    const doc = await getOwnedWorkout(uid, id);
    if (!doc) throw new ApiError(404, 'Workout not found');
    return void res.status(200).json({ workout: toWorkoutDTO(doc) });
  }

  if (req.method === 'DELETE') {
    await deleteWorkout(uid, id);
    return void res.status(204).end();
  }

  const parsed = updateWorkoutInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid workout patch: ${parsed.error.message}`);

  // Only fetched when the patch could actually need it -- an ongoing-injury
  // read on every PATCH would be wasted for the vast majority that aren't
  // completing the workout.
  const ongoingInjuryIds =
    parsed.data.status === 'completed' && parsed.data.injuries === undefined
      ? (await getOngoingInjuries(uid)).map((i) => i.id)
      : undefined;

  const result = await updateWorkout(uid, id, parsed.data, ongoingInjuryIds);
  // `=== true`, not truthiness: Vercel's builder compiles api/ with strict off,
  // where a boolean-literal discriminant only narrows on an explicit comparison.
  if (result.conflict === true) {
    return void res.status(409).json({ error: 'Workout was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remote.version });
  }
  return void res.status(200).json({ workout: result.workout });
});
