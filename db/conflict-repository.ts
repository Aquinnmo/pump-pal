import { getDb } from './client';
import { ConflictRecord, listUnresolved } from './conflicts';

export async function listUnresolvedConflicts(uid: string): Promise<ConflictRecord[]> {
  return listUnresolved(await getDb(), uid);
}
