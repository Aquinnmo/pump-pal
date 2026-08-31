// Direct Firestore implementation of the native sync engine's safe surface.
// It deliberately mirrors the existing manifest/pull interface so SQLite and
// the durable outbox stay unchanged while the legacy API transport disappears.
import {
  firestorePaths,
  firestoreTimestamp,
  type FirestoreDocumentReference,
  type DecodedFirestoreDocument,
} from '@timber/contract/firestore';
import {
  injuryDTO,
  catalogExerciseDTO,
  catalogResponse,
  directProfilePatchInput,
  profileDTO,
  pushupChallengeDTO,
  workoutDTO,
  type InjuryDTO,
  type ProfileDTO,
  type PushupChallengeDTO,
  type WorkoutDTO,
  type CatalogResponse,
} from '@timber/contract/api';
import {
  FirestoreAuthError,
  FirestoreConflictError,
  FirestorePermissionError,
  FirestoreRateLimitError,
  FirestoreValidationError,
} from '@/lib/firestore-rest-client-core';
import { normalizeTimestampsDeep, toIsoString } from './normalize-timestamps';
import { SyncAuthError, SyncConflictError, SyncPermanentError, SyncRateLimitError, type SyncRemote } from './sync-engine';
import type { Injury } from '@/types/user';
import type { ChallengeData } from '@/types/pushup-challenge';
import type { Workout } from '@/types/workout';

export type DirectFirestoreClient = {
  getDocument(path: string, fieldPaths?: string[], signal?: AbortSignal): Promise<DecodedFirestoreDocument | undefined>;
  documentReference(path: string): FirestoreDocumentReference;
  commit(
    writes: {
      path: string;
      fields?: Record<string, unknown>;
      updateMask?: string[];
      delete?: boolean;
      currentDocument?: { updateTime?: string } | { exists: boolean };
    }[],
    signal?: AbortSignal
  ): Promise<{ version?: string }[]>;
  runQuery(query: {
    collectionId: string;
    parentPath?: string;
    where?: { field: string; op: 'EQUAL'; value: unknown }[];
    orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[];
    limit: number;
    startAfter?: unknown[];
  }, signal?: AbortSignal): Promise<DecodedFirestoreDocument[]>;
};

const MAX_QUERY_LIMIT = 200;
const WORKOUT_FIELDS = [
  'userId', 'name', 'date', 'status', 'startedAt', 'queueOrder', 'notes',
  'performedExercises', 'injuries', 'schemaVersion', 'createdAt', 'updatedAt',
];
const INJURY_FIELDS = ['id', 'bodyPart', 'side', 'muscles', 'severity', 'status', 'onsetDate', 'resolvedDate', 'avoid', 'notes', 'createdAt', 'updatedAt'];

function idFromPath(document: DecodedFirestoreDocument): string {
  const id = document.path.split('/').at(-1);
  if (!id) throw new FirestoreValidationError('Firestore returned a document without an id.');
  return id;
}

function iso(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date || (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value)) {
    return toIsoString(value as Parameters<typeof toIsoString>[0]);
  }
  return fallback;
}

function timestamp(value: unknown, fallback: string) {
  return firestoreTimestamp(iso(value, fallback));
}

function optional<T>(value: T | undefined, key: string, target: Record<string, unknown>): void {
  if (value !== undefined) target[key] = value;
}

function workoutFields(uid: string, id: string, payload: Workout): Record<string, unknown> {
  if (payload.status === 'in_progress') {
    throw new FirestoreValidationError('In-progress workouts must remain local until they are finalized.');
  }
  const now = new Date().toISOString();
  const workout = normalizeTimestampsDeep(payload);
  const fields: Record<string, unknown> = {
    userId: uid,
    name: workout.name,
    status: workout.status ?? 'completed',
    performedExercises: workout.performedExercises ?? [],
    schemaVersion: 2,
    createdAt: timestamp(workout.createdAt, now),
    updatedAt: firestoreTimestamp(now),
  };
  optional(workout.date === undefined ? undefined : timestamp(workout.date, now), 'date', fields);
  optional(workout.startedAt === undefined ? undefined : timestamp(workout.startedAt, now), 'startedAt', fields);
  optional(workout.queueOrder, 'queueOrder', fields);
  optional(workout.notes, 'notes', fields);
  optional(workout.injuries, 'injuries', fields);
  // id is only the Firestore document id; never a field on the workout doc.
  void id;
  return fields;
}

function workoutDto(id: string, payload: Workout, version: string): WorkoutDTO {
  const now = new Date().toISOString();
  const workout = normalizeTimestampsDeep(payload);
  return workoutDTO.parse({
    id,
    name: workout.name,
    ...(workout.date === undefined ? {} : { date: iso(workout.date, now) }),
    status: workout.status ?? 'completed',
    ...(workout.startedAt === undefined ? {} : { startedAt: iso(workout.startedAt, now) }),
    ...(workout.queueOrder === undefined ? {} : { queueOrder: workout.queueOrder }),
    ...(workout.notes === undefined ? {} : { notes: workout.notes }),
    performedExercises: workout.performedExercises ?? [],
    ...(workout.injuries === undefined ? {} : { injuries: workout.injuries }),
    createdAt: iso(workout.createdAt, now),
    updatedAt: now,
    version,
  });
}

function decodeWorkout(document: DecodedFirestoreDocument): WorkoutDTO {
  return workoutDTO.parse({ ...document.fields, id: idFromPath(document), status: document.fields.status ?? 'completed', version: document.version });
}

function injuryFields(payload: Injury): Record<string, unknown> {
  const now = new Date().toISOString();
  const injury = normalizeTimestampsDeep(payload);
  const fields: Record<string, unknown> = {
    id: injury.id,
    bodyPart: injury.bodyPart,
    severity: injury.severity,
    status: injury.status,
    onsetDate: timestamp(injury.onsetDate, now),
    createdAt: timestamp(injury.createdAt, now),
    updatedAt: firestoreTimestamp(now),
  };
  optional(injury.side, 'side', fields);
  optional(injury.muscles, 'muscles', fields);
  optional(injury.resolvedDate === undefined ? undefined : injury.resolvedDate === null ? null : timestamp(injury.resolvedDate, now), 'resolvedDate', fields);
  optional(injury.avoid, 'avoid', fields);
  optional(injury.notes, 'notes', fields);
  return fields;
}

function injuryDto(payload: Injury, version: string): InjuryDTO {
  const now = new Date().toISOString();
  const injury = normalizeTimestampsDeep(payload);
  return injuryDTO.parse({
    ...injury,
    onsetDate: iso(injury.onsetDate, now),
    createdAt: iso(injury.createdAt, now),
    updatedAt: now,
    ...(injury.resolvedDate === undefined || injury.resolvedDate === null ? { resolvedDate: injury.resolvedDate } : { resolvedDate: iso(injury.resolvedDate, now) }),
    version,
  });
}

function decodeInjury(document: DecodedFirestoreDocument): InjuryDTO {
  return injuryDTO.parse({ ...document.fields, id: idFromPath(document) || document.fields.id, version: document.version });
}

function decodeProfile(document: DecodedFirestoreDocument, aiUsage: DecodedFirestoreDocument | undefined): ProfileDTO {
  return profileDTO.parse({
    workoutSplit: document.fields.workoutSplit ?? null,
    username: document.fields.username ?? null,
    aiUsage: aiUsage?.fields ?? null,
    aiEnabled: document.fields.aiEnabled ?? null,
    socialEnabled: document.fields.socialEnabled ?? null,
    version: document.version,
  });
}

function decodePushup(document: DecodedFirestoreDocument | undefined): PushupChallengeDTO {
  if (!document) return pushupChallengeDTO.parse({ startDate: null, days: [], longestStreak: 0, version: null });
  return pushupChallengeDTO.parse({ ...document.fields, version: document.version });
}

async function translateError<T>(
  run: () => Promise<T>,
  onConflict?: () => Promise<never>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FirestoreAuthError) throw new SyncAuthError(error.message);
    if (error instanceof FirestoreRateLimitError) throw new SyncRateLimitError(error.message, error.retryAfterMs);
    if (error instanceof FirestoreConflictError && onConflict) return onConflict();
    if (error instanceof FirestorePermissionError || error instanceof FirestoreValidationError) {
      throw new SyncPermanentError(error.message);
    }
    throw error;
  }
}

async function conflictFromDocument<T>(
  client: DirectFirestoreClient,
  path: string,
  decode: (document: DecodedFirestoreDocument) => T,
  signal?: AbortSignal
): Promise<never> {
  const remote = await client.getDocument(path, undefined, signal);
  if (!remote) throw new SyncPermanentError('This record was deleted on another device.');
  throw new SyncConflictError('Firestore document was modified by another device.', decode(remote), remote.version);
}

async function queryAll(
  client: DirectFirestoreClient,
  query: Omit<Parameters<DirectFirestoreClient['runQuery']>[0], 'limit' | 'startAfter'>,
  signal?: AbortSignal
): Promise<DecodedFirestoreDocument[]> {
  const documents: DecodedFirestoreDocument[] = [];
  let startAfter: unknown[] | undefined;
  do {
    const page = await client.runQuery({ ...query, limit: MAX_QUERY_LIMIT, startAfter }, signal);
    documents.push(...page);
    if (page.length < MAX_QUERY_LIMIT) return documents;
    const last = page.at(-1);
    const updatedAt = last?.fields.updatedAt;
    if (!last || typeof updatedAt !== 'string') {
      throw new FirestoreValidationError('Firestore sync query returned an unpageable document.');
    }
    startAfter = [firestoreTimestamp(updatedAt), client.documentReference(last.path)];
  } while (true);
}

/** Creates a transport for the signed-in user's owner-safe direct Firestore operations. */
export function createFirestoreSyncRemote(client: DirectFirestoreClient, uid: string): {
  remote: SyncRemote;
  workouts: {
    list(signal?: AbortSignal): Promise<{ version: string; data: WorkoutDTO }[]>;
    create(payload: Workout, id: string, signal?: AbortSignal): Promise<{ version: string; data: WorkoutDTO }>;
    update(id: string, payload: Workout, baseVersion: string | null, signal?: AbortSignal): Promise<{ version: string; data: WorkoutDTO }>;
    delete(id: string, baseVersion: string | null, signal?: AbortSignal): Promise<void>;
  };
  injuries: {
    list(signal?: AbortSignal): Promise<{ version: string; data: InjuryDTO }[]>;
    create(payload: Injury, signal?: AbortSignal): Promise<{ version: string; data: InjuryDTO }>;
    update(id: string, payload: Injury, baseVersion: string | null, signal?: AbortSignal): Promise<{ version: string; data: InjuryDTO }>;
    delete(id: string, baseVersion: string | null, signal?: AbortSignal): Promise<void>;
  };
  profile: {
    get(signal?: AbortSignal): Promise<{ version: string; data: ProfileDTO } | undefined>;
    read(signal?: AbortSignal): Promise<{ version: string; data: ProfileDTO }>;
    write(payload: { workoutSplit?: { type: string; custom: string | null }; aiEnabled?: boolean; socialEnabled?: boolean }, baseVersion: string | null, signal?: AbortSignal): Promise<{ version: string; data: ProfileDTO }>;
  };
  pushup: {
    read(signal?: AbortSignal): Promise<{ version: string | null; data: PushupChallengeDTO }>;
    write(payload: ChallengeData, baseVersion: string | null, signal?: AbortSignal): Promise<{ version: string; data: PushupChallengeDTO }>;
  };
} {
  const workoutPath = (id: string) => firestorePaths.workout(id);
  const injuryPath = (id: string) => firestorePaths.injury(uid, id);
  const pushupPath = firestorePaths.pushupChallenge(uid);

  const workouts = {
    async list(signal?: AbortSignal) {
      return translateError(async () => {
        const documents = await queryAll(client, {
          collectionId: 'workouts', where: [{ field: 'userId', op: 'EQUAL', value: uid }],
          orderBy: [{ field: 'updatedAt' }, { field: '__name__' }],
        }, signal);
        return documents.map((document) => ({ version: document.version, data: decodeWorkout(document) }));
      });
    },
    async create(payload: Workout, id: string, signal?: AbortSignal) {
      const path = workoutPath(id);
      return translateError(async () => {
        const fields = workoutFields(uid, id, payload);
        const [result] = await client.commit([{ path, fields, updateMask: WORKOUT_FIELDS, currentDocument: { exists: false } }], signal);
        if (!result.version) throw new FirestoreValidationError('Firestore did not return a workout version.');
        return { version: result.version, data: workoutDto(id, payload, result.version) };
      }, () => conflictFromDocument(client, path, decodeWorkout, signal));
    },
    async update(id: string, payload: Workout, baseVersion: string | null, signal?: AbortSignal) {
      if (!baseVersion) throw new SyncPermanentError('Cannot update a workout without a Firestore version.');
      const path = workoutPath(id);
      return translateError(async () => {
        const fields = workoutFields(uid, id, payload);
        const [result] = await client.commit([{ path, fields, updateMask: WORKOUT_FIELDS, currentDocument: { updateTime: baseVersion } }], signal);
        if (!result.version) throw new FirestoreValidationError('Firestore did not return a workout version.');
        return { version: result.version, data: workoutDto(id, payload, result.version) };
      }, () => conflictFromDocument(client, path, decodeWorkout, signal));
    },
    async delete(id: string, baseVersion: string | null, signal?: AbortSignal) {
      if (!baseVersion) return;
      const path = workoutPath(id);
      return translateError(
        () => client.commit([{ path, delete: true, currentDocument: { updateTime: baseVersion } }], signal).then(() => undefined),
        async () => {
          const remote = await client.getDocument(path, undefined, signal);
          if (!remote) return undefined as never;
          throw new SyncConflictError('Firestore document was modified by another device.', decodeWorkout(remote), remote.version);
        }
      );
    },
  };

  const injuries = {
    async list(signal?: AbortSignal) {
      return translateError(async () => {
        const documents = await queryAll(client, {
          collectionId: 'injuries', parentPath: firestorePaths.user(uid),
          orderBy: [{ field: 'updatedAt' }, { field: '__name__' }],
        }, signal);
        return documents.map((document) => ({ version: document.version, data: decodeInjury(document) }));
      });
    },
    async create(payload: Injury, signal?: AbortSignal) {
      const path = injuryPath(payload.id);
      const fields = injuryFields(payload);
      return translateError(async () => {
        const [result] = await client.commit([{ path, fields, updateMask: INJURY_FIELDS, currentDocument: { exists: false } }], signal);
        if (!result.version) throw new FirestoreValidationError('Firestore did not return an injury version.');
        return { version: result.version, data: injuryDto(payload, result.version) };
      }, () => conflictFromDocument(client, path, decodeInjury, signal));
    },
    async update(id: string, payload: Injury, baseVersion: string | null, signal?: AbortSignal) {
      if (!baseVersion) throw new SyncPermanentError('Cannot update an injury without a Firestore version.');
      const path = injuryPath(id);
      const fields = injuryFields(payload);
      return translateError(async () => {
        const [result] = await client.commit([{ path, fields, updateMask: INJURY_FIELDS, currentDocument: { updateTime: baseVersion } }], signal);
        if (!result.version) throw new FirestoreValidationError('Firestore did not return an injury version.');
        return { version: result.version, data: injuryDto(payload, result.version) };
      }, () => conflictFromDocument(client, path, decodeInjury, signal));
    },
    async delete(id: string, baseVersion: string | null, signal?: AbortSignal) {
      if (!baseVersion) return;
      const path = injuryPath(id);
      return translateError(
        () => client.commit([{ path, delete: true, currentDocument: { updateTime: baseVersion } }], signal).then(() => undefined),
        async () => {
          const remote = await client.getDocument(path, undefined, signal);
          if (!remote) return undefined as never;
          throw new SyncConflictError('Firestore document was modified by another device.', decodeInjury(remote), remote.version);
        }
      );
    },
  };

  const profile = {
    async get(signal?: AbortSignal) {
      return translateError(async () => {
        const document = await client.getDocument(firestorePaths.user(uid), undefined, signal);
        if (!document) return undefined;
        const aiUsage = await client.getDocument(firestorePaths.privateAiUsage(uid), undefined, signal);
        return { version: document.version, data: decodeProfile(document, aiUsage) };
      });
    },
    async read(signal?: AbortSignal) {
      const profile = await this.get(signal);
      if (!profile) throw new SyncPermanentError('The profile does not exist yet.');
      return profile;
    },
    async write(payload: { workoutSplit?: { type: string; custom: string | null }; aiEnabled?: boolean; socialEnabled?: boolean }, baseVersion: string | null, signal?: AbortSignal) {
      const patch = directProfilePatchInput.parse(payload);
      // Owner-writable fields are sent independently: a split change must not
      // carry preferences the caller never touched, and vice versa. The
      // updateMask has to name exactly the keys in `fields` — a commit without
      // one replaces the whole document, taking the server-owned username and
      // push token with it.
      const fields = {
        ...(patch.workoutSplit ? { workoutSplit: { ...patch.workoutSplit, updatedAt: firestoreTimestamp(new Date().toISOString()) } } : {}),
        ...(patch.aiEnabled === undefined ? {} : { aiEnabled: patch.aiEnabled }),
        ...(patch.socialEnabled === undefined ? {} : { socialEnabled: patch.socialEnabled }),
      };
      const updateMask = Object.keys(fields);
      if (updateMask.length === 0) throw new SyncPermanentError('Only a workout split, AI opt-in, or social preference can be synced directly.');
      const path = firestorePaths.user(uid);
      return translateError(async () => {
        const [result] = await client.commit([{
          path, fields, updateMask,
          ...(baseVersion ? { currentDocument: { updateTime: baseVersion } } : { currentDocument: { exists: false } }),
        }], signal);
        const document = await client.getDocument(path, undefined, signal);
        if (!document || !result.version) throw new FirestoreValidationError('Firestore did not return a profile version.');
        const aiUsage = await client.getDocument(firestorePaths.privateAiUsage(uid), undefined, signal);
        return { version: result.version, data: decodeProfile({ ...document, version: result.version }, aiUsage) };
      }, () => conflictFromDocument(client, path, (doc) => decodeProfile(doc, undefined), signal));
    },
  };

  const pushup = {
    async read(signal?: AbortSignal) {
      return translateError(async () => {
        const document = await client.getDocument(pushupPath, undefined, signal);
        return { version: document?.version ?? null, data: decodePushup(document) };
      });
    },
    async write(payload: ChallengeData, baseVersion: string | null, signal?: AbortSignal) {
      const fields = normalizeTimestampsDeep(payload);
      return translateError(async () => {
        const [result] = await client.commit([{
          path: pushupPath, fields, updateMask: ['startDate', 'days', 'longestStreak'],
          ...(baseVersion ? { currentDocument: { updateTime: baseVersion } } : { currentDocument: { exists: false } }),
        }], signal);
        if (!result.version) throw new FirestoreValidationError('Firestore did not return a pushup challenge version.');
        return { version: result.version, data: decodePushup({ path: pushupPath, fields, version: result.version }) };
      }, () => conflictFromDocument(client, pushupPath, decodePushup, signal));
    },
  };

  const remote: SyncRemote = {
    async manifest(_uid, cursor, signal) {
      // Firestore rules enforce the same <=200 bound. A page is intentionally
      // one bounded direct query per trust domain; with the app's small
      // per-user dataset this avoids a generic server manifest proxy.
      if (cursor) return { items: [], nextCursor: null };
      const [workoutDocuments, injuryDocuments, profileDocument, pushupDocument] = await Promise.all([
        queryAll(client, {
          collectionId: 'workouts', where: [{ field: 'userId', op: 'EQUAL', value: uid }],
          orderBy: [{ field: 'updatedAt' }, { field: '__name__' }],
        }, signal),
        queryAll(client, {
          collectionId: 'injuries', parentPath: firestorePaths.user(uid),
          orderBy: [{ field: 'updatedAt' }, { field: '__name__' }],
        }, signal),
        client.getDocument(firestorePaths.user(uid), undefined, signal),
        client.getDocument(pushupPath, undefined, signal),
      ]);
      return {
        items: [
          ...workoutDocuments.map((document) => ({ kind: 'workout', id: idFromPath(document), version: document.version })),
          ...injuryDocuments.map((document) => ({ kind: 'injury', id: idFromPath(document), version: document.version })),
          ...(profileDocument ? [{ kind: 'profile', id: uid, version: profileDocument.version }] : []),
          ...(pushupDocument ? [{ kind: 'pushupChallenge', id: uid, version: pushupDocument.version }] : []),
        ],
        nextCursor: null,
      };
    },
    async pull(entities, signal) {
      const found: { kind: string; id: string; version: string; data: unknown }[] = [];
      const missing: { kind: string; id: string }[] = [];
      await Promise.all(entities.map(async (entity) => {
        const path = entity.kind === 'workout'
          ? workoutPath(entity.id)
          : entity.kind === 'injury'
            ? injuryPath(entity.id)
            : entity.kind === 'profile'
              ? firestorePaths.user(uid)
              : pushupPath;
        const document = await client.getDocument(path, undefined, signal);
        if (!document) {
          missing.push({ kind: entity.kind, id: entity.id });
          return;
        }
        if (entity.kind === 'workout') found.push({ kind: entity.kind, id: entity.id, version: document.version, data: decodeWorkout(document) });
        if (entity.kind === 'injury') found.push({ kind: entity.kind, id: entity.id, version: document.version, data: decodeInjury(document) });
        if (entity.kind === 'profile') {
          const aiUsage = await client.getDocument(firestorePaths.privateAiUsage(uid), undefined, signal);
          found.push({ kind: entity.kind, id: entity.id, version: document.version, data: decodeProfile(document, aiUsage) });
        }
        if (entity.kind === 'pushupChallenge') found.push({ kind: entity.kind, id: entity.id, version: document.version, data: decodePushup(document) });
      }));
      return { found, missing };
    },
  };

  return { remote, workouts, injuries, profile, pushup };
}

/** Fetches the approved catalog directly; pending submissions remain Worker-only. */
export async function getApprovedCatalogSnapshot(
  client: DirectFirestoreClient,
  signal?: AbortSignal
): Promise<CatalogResponse> {
  return translateError(async () => {
    const [exerciseDocuments, meta] = await Promise.all([
      queryAll(client, {
        collectionId: 'exercises', where: [{ field: 'status', op: 'EQUAL', value: 'approved' }],
        orderBy: [{ field: 'name' }, { field: '__name__' }],
      }, signal),
      client.getDocument(firestorePaths.catalogMeta(), undefined, signal),
    ]);
    if (!meta) throw new FirestoreValidationError('The exercise catalog metadata is missing.');
    return catalogResponse.parse({
      exercises: exerciseDocuments.map((document) => catalogExerciseDTO.parse({ ...document.fields, id: idFromPath(document) })),
      version: meta.fields.version,
    });
  });
}
