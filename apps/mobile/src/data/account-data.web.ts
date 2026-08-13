// Web build of src/data/account-data.ts. Web repositories read and write through
// to Firestore per request, so there is no outbox to drain — but there is now a
// session read cache (src/data/web-read-cache.ts) that must not survive a sign-out.
import { invalidateWebReads } from './web-direct-firestore';

export async function countPendingSync(_uid: string): Promise<number> {
  return 0;
}

export async function syncBeforeSignOut(_uid: string): Promise<void> {}

export async function purgeLocalAccountData(_uid: string): Promise<void> {
  invalidateWebReads();
}
