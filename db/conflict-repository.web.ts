import { ConflictRecord } from './conflicts';

// Web is immediately API-backed and has no local outbox/conflict store.
export async function listUnresolvedConflicts(_uid: string): Promise<ConflictRecord[]> {
  return [];
}
