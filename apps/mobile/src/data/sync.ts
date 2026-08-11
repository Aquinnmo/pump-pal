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
import * as remoteWorkouts from '@/data/remote/workouts';
import * as remoteInjuries from '@/data/remote/injuries';
import * as remoteProfile from '@/data/remote/profile';
import * as remotePushup from '@/data/remote/pushup';
import * as remoteCatalog from '@/data/remote/catalog';
import * as remoteSync from '@/data/remote/sync';
import { ApiAuthError, ApiConflictError, ApiRateLimitError } from '@/lib/api-client';
import { Workout } from '@/types/workout';
import { ChallengeData } from '@/types/pushup-challenge';
import { Injury, UserDoc } from '@/types/user';
import { normalizeTimestampsDeep } from './normalize-timestamps';
import { CreateWorkoutInput, UpdateWorkoutInput, WorkoutDTO, PullRequest, InjuryDTO, ProfileDTO, PushupChallengeDTO } from '@timber/contract/api';

function translateApiError(err: unknown): never {
  if (err instanceof ApiAuthError) throw new SyncAuthError(err.message);
  if (err instanceof ApiConflictError) throw new SyncConflictError(err.message, err.remote, err.remoteVersion);
  if (err instanceof ApiRateLimitError) throw new SyncRateLimitError(err.message, err.retryAfterMs);
  throw err;
}

// Mirrors src/data/workout-repository.web.ts's toCreateInput — kept separate
// rather than shared because that file is the *web repository* (called
// every read/write) while this is the *sync push path* (called only from
// queued outbox payloads); a shared helper would need a third file for one
// six-line function.
function workoutPayloadToCreateInput(id: string, payload: unknown): CreateWorkoutInput {
  const w = payload as Workout;
  return {
    id,
    name: w.name,
    date: typeof w.date === 'string' ? w.date : undefined,
    status: w.status ?? 'completed',
    notes: w.notes,
    performedExercises: (w.performedExercises ?? []) as CreateWorkoutInput['performedExercises'],
    injuries: w.injuries,
  };
}

function workoutPayloadToUpdateInput(payload: unknown, baseVersion: string): UpdateWorkoutInput {
  const w = payload as Workout;
  return {
    name: w.name,
    date: typeof w.date === 'string' ? w.date : undefined,
    status: w.status,
    notes: w.notes,
    performedExercises: w.performedExercises as UpdateWorkoutInput['performedExercises'],
    injuries: w.injuries,
    baseVersion,
  };
}

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
    async create(payload, id, signal) {
      try {
        const dto = await remoteWorkouts.createWorkout(workoutPayloadToCreateInput(id, payload), { signal });
        return { version: dto.version, data: dto };
      } catch (err) {
        translateApiError(err);
      }
    },
    async update(id, payload, baseVersion, signal) {
      try {
        const dto = await remoteWorkouts.updateWorkout(
          id,
          workoutPayloadToUpdateInput(payload, baseVersion ?? ''),
          { signal }
        );
        return { version: dto.version, data: dto };
      } catch (err) {
        translateApiError(err);
      }
    },
    async delete(id, baseVersion, signal) {
      try {
        await remoteWorkouts.deleteWorkout(id, baseVersion ?? '', { signal });
      } catch (err) {
        translateApiError(err);
      }
    },
  },
};

function profileFromDto(dto: ProfileDTO): UserDoc {
  return {
    ...(dto.workoutSplit ? { workoutSplit: { ...dto.workoutSplit, updatedAt: new Date().toISOString() } } : {}),
    ...(dto.username ? { username: dto.username, usernameLower: dto.username.toLowerCase() } : {}),
    ...(dto.aiUsage ? { aiUsage: dto.aiUsage } : {}),
  };
}
function profilePatch(payload: unknown, baseVersion: string | null) {
  const profile = payload as UserDoc;
  return {
    ...(profile.workoutSplit ? { workoutSplit: { type: profile.workoutSplit.type, custom: profile.workoutSplit.custom } } : {}),
    ...(profile.username !== undefined ? { username: profile.username } : {}),
    ...(baseVersion ? { baseVersion } : {}),
  };
}
function challengeFromDto(dto: PushupChallengeDTO): ChallengeData {
  return { startDate: dto.startDate ?? '', days: dto.days, longestStreak: dto.longestStreak };
}
function injuryCreateInput(payload: Injury) {
  return normalizeTimestampsDeep(payload) as unknown as Parameters<typeof remoteInjuries.createInjury>[0];
}

const profileAdapter: EntityAdapter = {
  entityType: 'profile', wireKind: 'profile',
  local: {
    async getAllRows(db, uid) { const row = await getSingleton<UserDoc>(db, 'profile', uid); return row ? [{ id: uid, syncState: row.syncState, serverVersion: row.serverVersion, data: row.data }] : []; },
    writeSynced: (db, uid, _id, data, version) => upsertSingleton(db, 'profile', 'profile', uid, profileFromDto(data as ProfileDTO), { syncState: 'synced', serverVersion: version }),
    removeClean: (db, uid) => removeCleanSingleton(db, 'profile', uid),
  },
  remote: {
    async create(payload, _id, signal) { try { const dto = await remoteProfile.patchProfile(profilePatch(payload, null), { signal }); return { version: dto.version, data: dto }; } catch (err) { translateApiError(err); } },
    async update(_id, payload, baseVersion, signal) { try { const dto = await remoteProfile.patchProfile(profilePatch(payload, baseVersion), { signal }); return { version: dto.version, data: dto }; } catch (err) { translateApiError(err); } },
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
    async create(payload, _id, signal) { try { const response = await remoteInjuries.createInjury(injuryCreateInput(payload as Injury), { signal }); return { version: response.version, data: response.injury }; } catch (err) { translateApiError(err); } },
    async update(id, payload, baseVersion, signal) { try { const injury = payload as Injury; const response = await remoteInjuries.updateInjury(id, { side: injury.side, muscles: injury.muscles, severity: injury.severity, status: injury.status, resolvedDate: injury.resolvedDate as string | null | undefined, avoid: injury.avoid, notes: injury.notes, ...(baseVersion ? { baseVersion } : {}) }, { signal }); return { version: response.version, data: response.injury }; } catch (err) { translateApiError(err); } },
    async delete(id, _baseVersion, signal) { try { await remoteInjuries.deleteInjury(id, { signal }); } catch (err) { translateApiError(err); } },
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
    async create(payload, _id, signal) { const data = payload as ChallengeData; try { const dto = await remotePushup.putPushupChallenge({ ...data, baseVersion: null }, { signal }); return { version: dto.version ?? '', data: dto }; } catch (err) { translateApiError(err); } },
    async update(_id, payload, baseVersion, signal) { const data = payload as ChallengeData; try { const dto = await remotePushup.putPushupChallenge({ ...data, baseVersion }, { signal }); return { version: dto.version ?? '', data: dto }; } catch (err) { translateApiError(err); } },
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

const ADAPTERS: EntityAdapter[] = [workoutAdapter, injuryAdapter, profileAdapter, pushupAdapter, catalogAdapter];

const remote: SyncRemote = {
  async manifest(_uid, cursor, signal) {
    const page = await remoteSync.getManifest({ cursor }, { signal });
    return { items: page.items, nextCursor: page.nextCursor };
  },
  async pull(entities, signal) {
    const response = await remoteSync.pull(
      { entities: entities as PullRequest['entities'] },
      { signal }
    );
    const found: { kind: string; id: string; version: string; data: unknown }[] = [
      ...response.workouts.map((dto: WorkoutDTO) => ({ kind: 'workout', id: dto.id, version: dto.version, data: dto })),
      ...response.injuries.map((dto: InjuryDTO) => ({ kind: 'injury', id: dto.id, version: entities.find((entity) => entity.kind === 'injury' && entity.id === dto.id)?.version ?? '', data: dto })),
      ...(response.profile ? [{ kind: 'profile', id: entities.find((e) => e.kind === 'profile')?.id ?? '', version: response.profile.version, data: response.profile }] : []),
      ...(response.pushupChallenge ? [{ kind: 'pushupChallenge', id: entities.find((e) => e.kind === 'pushupChallenge')?.id ?? '', version: response.pushupChallenge.version ?? '', data: response.pushupChallenge }] : []),
    ];
    const foundKeys = new Set(found.map((item) => `${item.kind}:${item.id}`));
    const missing = [...response.missing, ...entities.filter((entity) => !foundKeys.has(`${entity.kind}:${entity.id}`) && !response.missing.some((missing) => missing.kind === entity.kind && missing.id === entity.id))];
    return { found, missing };
  },
};

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
    return runSyncCore(db, uid, ADAPTERS, remote, opts);
  });
}
