import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPendingExerciseInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { createPendingExercise } from '../_lib/store/catalog.js';

/** POST /api/catalog/pending -- "can't find my exercise" submission. `createdBy` is always the verified uid, never accepted from the body. */
export default withRoute(['POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  const parsed = createPendingExerciseInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid pending exercise input: ${parsed.error.message}`);

  const exercise = await createPendingExercise(uid, parsed.data.name);
  return void res.status(201).json({ exercise });
});
