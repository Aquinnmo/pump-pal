import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createWorkoutInput,
  listWorkoutsQuery,
  reorderWorkoutsInput,
  updateWorkoutInput,
} from '@timber/contract/api';
import { ApiError, withRoute } from '../http.js';
import { getOngoingInjuries } from '../store/profile.js';
import {
  createWorkout,
  deleteWorkout,
  getOwnedWorkout,
  listWorkouts,
  reorderWorkouts,
  toWorkoutDTO,
  updateWorkout,
} from '../store/workouts.js';

/**
 * GET  /api/workouts?status=&cursor=&limit=   -- list, scoped to the caller's uid
 * POST /api/workouts                          -- create; body.id is client-supplied
 *                                                 for idempotent offline retries
 */
export const collection = withRoute(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
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

/** PATCH /api/workouts/reorder -- bulk queueOrder update, e.g. from the planned-workouts screen. */
export const reorder = withRoute(['PATCH'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = reorderWorkoutsInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid reorder input: ${parsed.error.message}`);

  await reorderWorkouts(uid, parsed.data.order);
  return void res.status(204).end();
});

/**
 * GET    /api/workouts/:id
 * PATCH  /api/workouts/:id  -- versioned (baseVersion required); 409 on stale version
 * DELETE /api/workouts/:id  -- idempotent
 */
export const item = withRoute(['GET', 'PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
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
