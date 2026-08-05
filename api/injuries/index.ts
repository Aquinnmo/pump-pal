import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createInjuryInput } from '../../shared/api-contract.js';
import { ApiError, withRoute } from '../_lib/http.js';
import { createInjury, listInjuries } from '../_lib/store/injuries.js';

/**
 * GET  /api/injuries  -- full history for the caller
 * POST /api/injuries  -- create; body.id is client-supplied for idempotent retry
 */
export default withRoute(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse, { uid }) => {
  if (req.method === 'GET') {
    const { injuries, version } = await listInjuries(uid);
    return void res.status(200).json({ injuries, version });
  }

  const parsed = createInjuryInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, `Invalid injury input: ${parsed.error.message}`);

  const { injury, version } = await createInjury(uid, parsed.data);
  return void res.status(201).json({ injury, version });
});
