import { ConflictResolution } from './conflict-resolution';

export async function resolveStoredConflict(
  _uid: string,
  _conflictId: string,
  _resolution: ConflictResolution
): Promise<void> {
  throw new Error('Conflict resolution is only needed for offline native data.');
}
