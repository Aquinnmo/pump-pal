// Real wiring for the sync engine (src/data/sync-engine.ts): binds it to the
// native src/data/client.ts, the local workout/profile/pushup repositories, and
// repositories/remote/*.ts. This is what src/data/sync-trigger.ts calls — never
// src/data/sync-engine.ts directly.
//
// Enforces the two rules the core engine documents but can't enforce itself:
// one run at a time per uid (module-level mutex, keyed by uid so switching
// accounts can't deadlock on a stale lock), and never syncing for a
// signed-out or different uid than the currently authenticated user.
import { getDb } from './client';
import { createKeyedMutex } from './keyed-mutex';
import * as workoutsLocal from './workouts';
import * as injuriesLocal from './injuries';
import * as catalogLocal from './catalog';
import { getSingleton, upsertSingleton, removeCleanSingleton } from './singleton-repository';
import {
  runSync as runSyncCore,
  EntityAdapter,
  SyncRemote,
  SyncOutcome,
  SyncAuthError,
  SyncConflictError,
  SyncRateLimitError,
} from './sync-engine';
import * as remoteCatalog from '@/data/remote/catalog';
import { ApiAuthError, ApiConflictError, ApiRateLimitError } from '@/lib/api-client';
import { firestoreRestClient } from '@/lib/firestore-rest-client';
import { createFirestoreSyncRemote } from './firestore-sync-remote';
import { Workout } from '@/types/workout';
import { ChallengeData } from '@/types/pushup-challenge';
import { Injury, UserDoc } from '@/types/user';
import { WorkoutDTO, ProfileDTO, PushupChallengeDTO } from '@timber/contract/api';

function translateApiError(err: unknown): never {
  if (err instanceof ApiAuthError) throw new SyncAuthError(err.message);
  if (err instanceof ApiConflictError) throw new SyncConflictError(err.message, err.remote, err.remoteVersion);
  if (err instanceof ApiRateLimitError) throw new SyncRateLimitError(err.message, err.retryAfterMs);
  throw err;
}

function createAdapters(uid: string): { adapters: EntityAdapter[]; remote: SyncRemote } {
  const direct = createFirestoreSyncRemote(firestoreRestClient(), uid);

const workoutAdapter: EntityAdapter = {
  entityType: 'workout',
  wireKind: 'workout',
  local: {
    async getAllRows(db, uid) {
      const rows = await workoutsLocal.getAll(db, uid);
      return rows.map((r) => ({ id: r.id, syncState: r.syncState, serverVersion: r.serverVersion, data: r.data }));
    },
    async writeSynced(db, uid, id, data, version) {
      await workoutsLocal.update(db, uid, id, data as Workout, { syncState: 'synced', serverVersion: version });
    },
    removeClean: workoutsLocal.removeClean,
  },
  remote: {
    create: (payload, id, signal) => direct.workouts.create(payload as Workout, id, signal),
    update: (id, payload, baseVersion, signal) => direct.workouts.update(id, payload as Workout, baseVersion, signal),
    delete: (id, baseVersion, signal) => direct.workouts.delete(id, baseVersion, signal),
  },
};

function profileFromDto(dto: ProfileDTO): UserDoc {
  return {
    ...(dto.workoutSplit ? { workoutSplit: { ...dto.workoutSplit, updatedAt: new Date().toISOString() } } : {}),
    ...(dto.username ? { username: dto.username, usernameLower: dto.username.toLowerCase() } : {}),
    ...(dto.aiUsage ? { aiUsage: dto.aiUsage } : {}),
  };
}
function profilePatch(payload: unknown) {
  const profile = payload as UserDoc;
  return {
    ...(profile.workoutSplit ? { workoutSplit: { type: profile.workoutSplit.type, custom: profile.workoutSplit.custom } } : {}),
  };
}
function challengeFromDto(dto: PushupChallengeDTO): ChallengeData {
  return { startDate: dto.startDate ?? '', days: dto.days, longestStreak: dto.longestStreak };
}
const profileAdapter: EntityAdapter = {
  entityType: 'profile', wireKind: 'profile',
  local: {
    async getAllRows(db, uid) { const row = await getSingleton<UserDoc>(db, 'profile', uid); return row ? [{ id: uid, syncState: row.syncState, serverVersion: row.serverVersion, data: row.data }] : []; },
    writeSynced: (db, uid, _id, data, version) => upsertSingleton(db, 'profile', 'profile', uid, profileFromDto(data as ProfileDTO), { syncState: 'synced', serverVersion: version }),
    removeClean: (db, uid) => removeCleanSingleton(db, 'profile', uid),
  },
  remote: {
    async create(payload, _id, signal) {
      const patch = profilePatch(payload);
      return patch.workoutSplit ? direct.profile.write(patch, null, signal) : direct.profile.read(signal);
    },
    async update(_id, payload, baseVersion, signal) {
      const patch = profilePatch(payload);
      return patch.workoutSplit ? direct.profile.write(patch, baseVersion, signal) : direct.profile.read(signal);
    },
    async delete() { return; },
  },
};

const injuryAdapter: EntityAdapter = {
  entityType: 'injury', wireKind: 'injury',
  local: {
    async getAllRows(db, uid) { return (await injuriesLocal.getAll(db, uid)).map((row) => ({ id: row.id, syncState: row.syncState, serverVersion: row.serverVersion, data: row.data })); },
    writeSynced: (db, uid, _id, data, version) => injuriesLocal.update(db, uid, data as Injury, { syncState: 'synced', serverVersion: version }),
    removeClean: injuriesLocal.removeClean,
  },
  remote: {
    create: (payload, _id, signal) => direct.injuries.create(payload as Injury, signal),
    update: (id, payload, baseVersion, signal) => direct.injuries.update(id, payload as Injury, baseVersion, signal),
    delete: (id, baseVersion, signal) => direct.injuries.delete(id, baseVersion, signal),
  },
};

const pushupAdapter: EntityAdapter = {
  entityType: 'pushup_challenge', wireKind: 'pushupChallenge',
  local: {
    async getAllRows(db, uid) { const row = await getSingleton<ChallengeData>(db, 'pushup_challenge', uid); return row ? [{ id: uid, syncState: row.syncState, serverVersion: row.serverVersion, data: row.data }] : []; },
    writeSynced: (db, uid, _id, data, version) => upsertSingleton(db, 'pushup_challenge', 'pushup_challenge', uid, challengeFromDto(data as PushupChallengeDTO), { syncState: 'synced', serverVersion: version }),
    removeClean: (db, uid) => removeCleanSingleton(db, 'pushup_challenge', uid),
  },
  remote: {
    async create(payload, _id, signal) { return direct.pushup.write(payload as ChallengeData, null, signal); },
    async update(_id, payload, baseVersion, signal) { return direct.pushup.write(payload as ChallengeData, baseVersion, signal); },
    async delete() { return; },
  },
};

const catalogAdapter: EntityAdapter = {
  entityType: 'catalog_exercise',
  local: {
    async getAllRows() { return []; },
    async writeSynced(db, uid, id) { await catalogLocal.markSynced(db, uid, id); },
    async removeClean() { return; },
  },
  remote: {
    async create(payload, _id, signal) { try { const response = await remoteCatalog.createPendingExercise({ name: (payload as { name: string }).name }, { signal }); return { version: '', data: response.exercise }; } catch (err) { translateApiError(err); } },
    async update() { throw new Error('Pending catalog exercises are create-only.'); },
    async delete() { return; },
  },
};

return { adapters: [workoutAdapter, injuryAdapter, profileAdapter, pushupAdapter, catalogAdapter], remote: direct.remote };
}

// One in-flight run per uid — see src/data/keyed-mutex.ts. A call for a
// *different* uid runs independently (relevant only mid account-switch).
const mutex = createKeyedMutex<SyncOutcome>();

export async function syncNow(
  uid: string,
  currentUid: string | null,
  opts?: Parameters<typeof runSyncCore>[4]
): Promise<SyncOutcome> {
  if (!currentUid || currentUid !== uid) {
    // Never sync for a signed-out or different uid than the caller's own —
    // caller (src/data/sync-trigger.ts) passes the live Firebase auth uid so this
    // module itself never has to import Firebase.
    return { status: 'auth-required' };
  }
  return mutex.run(uid, async () => {
    const db = await getDb();
    const { adapters, remote } = createAdapters(uid);
    return runSyncCore(db, uid, adapters, remote, opts);
  });
}
