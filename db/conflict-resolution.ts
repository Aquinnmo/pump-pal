import { getDb } from './client';
import { getConflict } from './conflicts';
import { resolveKeepLocal, resolveUseServer } from './workouts';
import { resolveConflict } from './conflicts';
import * as injuries from './injuries';
import { upsertSingleton, removeCleanSingleton } from './singleton-repository';
import { Injury, UserDoc } from '@/types/user';
import { ChallengeData } from '@/types/pushup-challenge';
import { triggerSyncAfterWrite } from './sync-trigger';

export type ConflictResolution = 'keep-local' | 'use-server';

/**
 * Resolves a persisted conflict only for its owning uid. The uid check is
 * intentional defence in depth for account switching: a stale settings
 * screen can never apply one person's choice to another person's record.
 */
export async function resolveStoredConflict(
  uid: string,
  conflictId: string,
  resolution: ConflictResolution
): Promise<void> {
  const db = await getDb();
  const conflict = await getConflict(db, conflictId);
  if (!conflict || conflict.uid !== uid) throw new Error('This sync conflict is no longer available.');

  if (conflict.entityType === 'workout') {
    if (resolution === 'keep-local') await resolveKeepLocal(db, conflict);
    else await resolveUseServer(db, conflict);
  } else if (conflict.entityType === 'injury') {
    const server = conflict.serverData as { version?: string } | null;
    if (resolution === 'keep-local') {
      await injuries.write(db, uid, conflict.localData as Injury, server ? 'update' : 'create', { syncState: 'dirty', serverVersion: server?.version ?? null });
    } else if (!server) {
      await injuries.removeClean(db, uid, conflict.entityId);
    } else {
      await injuries.update(db, uid, conflict.serverData as Injury, { syncState: 'synced', serverVersion: server.version ?? null });
    }
    await resolveConflict(db, conflict.id);
  } else if (conflict.entityType === 'profile' || conflict.entityType === 'pushup_challenge') {
    const table = conflict.entityType === 'profile' ? 'profile' : 'pushup_challenge';
    const local = conflict.localData as UserDoc | ChallengeData;
    const server = conflict.serverData as { version?: string } | null;
    if (resolution === 'keep-local') {
      await upsertSingleton(db, table, conflict.entityType, uid, local, { syncState: 'dirty', serverVersion: server?.version ?? null });
    } else if (!server) {
      await removeCleanSingleton(db, table, uid);
    } else {
      const data = table === 'profile'
        ? { ...(server as UserDoc), ...(server && (server as UserDoc).workoutSplit ? { workoutSplit: { ...(server as UserDoc).workoutSplit!, updatedAt: new Date().toISOString() } } : {}) }
        : (() => { const challenge = server as ChallengeData & { startDate?: string | null }; return { startDate: challenge.startDate ?? '', days: challenge.days ?? [], longestStreak: challenge.longestStreak ?? 0 }; })();
      await upsertSingleton(db, table, conflict.entityType, uid, data, { syncState: 'synced', serverVersion: server.version ?? null });
    }
    await resolveConflict(db, conflict.id);
  } else {
    throw new Error(`Unsupported conflict type: ${conflict.entityType}`);
  }

  triggerSyncAfterWrite();
}
