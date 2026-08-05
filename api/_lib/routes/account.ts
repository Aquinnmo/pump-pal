import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withRoute } from '../http.js';
import { deleteAccountData } from '../store/account.js';

/**
 * DELETE /api/account/data -- purges every per-user Firestore
 * collection/doc. Does NOT delete the Firebase Auth account; the client
 * calls `deleteUser(auth.currentUser)` itself, only after this returns
 * `partial: false`.
 */
export const data = withRoute(['DELETE'], async (_req: VercelRequest, res: VercelResponse, { uid }) => {
  const result = await deleteAccountData(uid);
  return void res.status(200).json(result);
});
