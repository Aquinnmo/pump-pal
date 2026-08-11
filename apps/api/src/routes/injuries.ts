import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createInjuryInput, updateInjuryInput } from '@timber/contract/api';
import { ApiError, withRoute } from '../http.js';
import {
  applyInjuryToHistory,
  createInjury,
  deleteInjury,
  listInjuries,
  removeInjuryFromHistory,
  updateInjury,
} from '../store/injuries.js';

/**
 * GET  /api/injuries  -- full history for the caller
 * POST /api/injuries  -- create; body.id is client-supplied for idempotent retry
 */
export const collection = withRoute(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const { injuries, version } = await listInjuries(uid);
    return void res.status(200).json({ injuries, version });
  }

  const parsed = createInjuryInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid injury input: ${parsed.error.message}`);

  const { injury, version } = await createInjury(uid, parsed.data);
  return void res.status(201).json({ injury, version });
});

/**
 * PATCH  /api/injuries/:id  -- partial edit (e.g. resolve); baseVersion optional (see contract notes)
 * DELETE /api/injuries/:id  -- idempotent; does NOT unstamp history (see .../remove-from-history)
 */
export const item = withRoute(['PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  if (req.method === 'DELETE') {
    await deleteInjury(uid, id);
    return void res.status(204).end();
  }

  const parsed = updateInjuryInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid injury patch: ${parsed.error.message}`);

  const result = await updateInjury(uid, id, parsed.data);
  // `=== true`, not truthiness: Vercel's builder compiles api/ with strict off,
  // where a boolean-literal discriminant only narrows on an explicit comparison.
  if (result.conflict === true) {
    // The injury record itself isn't independently versioned (it's an array
    // element on the user doc) -- a conflict here means "the user doc moved
    // under you", so the caller should re-GET /api/injuries and retry.
    return void res
      .status(409)
      .json({ error: 'Profile was modified since baseVersion', code: 'conflict', remote: result.remote, remoteVersion: result.remoteVersion });
  }
  return void res.status(200).json({ injury: result.injury, version: result.version });
});

/** POST /api/injuries/:id/apply-to-history -- stamp this injury onto every workout in its onset/resolved window. Idempotent. */
export const applyToHistory = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  const { injuries } = await listInjuries(uid);
  const injury = injuries.find((i) => i.id === id);
  if (!injury) throw new ApiError(404, 'Injury not found');

  const affectedWorkoutIds = await applyInjuryToHistory(uid, injury);
  return void res.status(200).json({ affectedWorkoutIds });
});

/**
 * POST /api/injuries/:id/remove-from-history -- unstamp this injury id from
 * every workout that carries it. No lookup against the live injury record
 * (unlike apply-to-history) since this must still work after the injury
 * itself has been deleted -- matching the client's current order of
 * operations (unstamp history, then delete the record). Idempotent.
 */
export const removeFromHistory = withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const id = req.query.id;
  if (typeof id !== 'string') throw new ApiError(400, 'Missing injury id');

  const affectedWorkoutIds = await removeInjuryFromHistory(uid, id);
  return void res.status(200).json({ affectedWorkoutIds });
});
