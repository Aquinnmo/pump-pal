import type { CreateWorkoutInput, UpdateWorkoutInput, WorkoutDTO } from '../../../shared/api-contract.js';
import { ApiError } from '../http.js';
import { commit, deleteDoc, getDoc, runQuery, ts, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * `workouts/{id}` read/write, mirroring the invariants `utils/wear-action-task.ts`
 * and `app/active-workout.tsx` currently enforce client-side: every doc carries
 * its own `userId` (top-level collection, not nested), `status` defaults to
 * 'completed' when absent (pre-status-field docs), and a workout is only ever
 * touched by its owner.
 */

const WORKOUTS_COLLECTION = 'workouts';

function workoutIdFromPath(path: string): string {
  return path.split('/').pop()!;
}

/** Firestore round-trips numbers that happen to be whole as integers; sets/exercises need doubles preserved where the client sent them, but JS numbers don't carry that distinction back, so this is intentionally a no-op passthrough documenting the boundary. */
function asRecord(value: DecodedValue): Record<string, DecodedValue> {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, DecodedValue>;
}
function asArray(value: DecodedValue): DecodedValue[] {
  return Array.isArray(value) ? value : [];
}

export function toWorkoutDTO(doc: FirestoreDoc): WorkoutDTO {
  const f = doc.fields;
  return {
    id: workoutIdFromPath(doc.path),
    name: (f.name as string) ?? '',
    date: typeof f.date === 'string' ? f.date : undefined,
    status: (f.status as WorkoutDTO['status']) ?? 'completed',
    startedAt: typeof f.startedAt === 'string' ? f.startedAt : undefined,
    queueOrder: typeof f.queueOrder === 'number' ? f.queueOrder : undefined,
    notes: typeof f.notes === 'string' ? f.notes : undefined,
    performedExercises: asArray(f.performedExercises).map((pe) => {
      const r = asRecord(pe);
      return {
        order: Number(r.order ?? 0),
        exerciseId: String(r.exerciseId ?? ''),
        exerciseRefPath: String(r.exerciseRefPath ?? ''),
        exerciseNameSnapshot: String(r.exerciseNameSnapshot ?? ''),
        variationId: (r.variationId as string | null) ?? null,
        variationNameSnapshot: (r.variationNameSnapshot as string | null) ?? null,
        notes: typeof r.notes === 'string' ? r.notes : undefined,
        sets: asArray(r.sets).map((s) => asRecord(s) as unknown as WorkoutDTO['performedExercises'][number]['sets'][number]),
      };
    }),
    injuries: Array.isArray(f.injuries) ? (f.injuries as string[]) : undefined,
    createdAt: (f.createdAt as string) ?? new Date(0).toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date(0).toISOString(),
    version: doc.updateTime,
  };
}

export async function getOwnedWorkout(uid: string, id: string): Promise<FirestoreDoc | undefined> {
  const doc = await getDoc(`${WORKOUTS_COLLECTION}/${id}`);
  if (!doc) return undefined;
  if (doc.fields.userId !== uid) throw new ApiError(404, 'Workout not found');
  return doc;
}

export interface ListWorkoutsResult {
  items: WorkoutDTO[];
  nextCursor: string | null;
}

/** Ordered by `createdAt desc` — stable even for planned workouts with no `date` yet, unlike the client's `orderBy('date')` reads which only work for dated/history rows. */
export async function listWorkouts(
  uid: string,
  opts: { status?: string; cursor?: string; limit?: number }
): Promise<ListWorkoutsResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where: { field: string; op: 'EQUAL'; value: unknown }[] = [{ field: 'userId', op: 'EQUAL', value: uid }];
  if (opts.status) where.push({ field: 'status', op: 'EQUAL', value: opts.status });

  const docs = await runQuery({
    collectionId: WORKOUTS_COLLECTION,
    where,
    orderBy: [{ field: 'createdAt', direction: 'DESCENDING' }],
    limit: limit + 1,
    startAfter: opts.cursor ? [ts(opts.cursor)] : undefined,
  });

  const page = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? (page[page.length - 1]?.fields.createdAt as string) ?? null : null;
  return { items: page.map(toWorkoutDTO), nextCursor };
}

/**
 * Idempotent create: a retried POST with the same client-supplied `id` that
 * already belongs to this uid returns the existing doc instead of erroring or
 * duplicating — exactly the "safely acknowledge an already-applied result"
 * requirement for offline retries.
 */
export async function createWorkout(uid: string, input: CreateWorkoutInput): Promise<WorkoutDTO> {
  const path = `${WORKOUTS_COLLECTION}/${input.id}`;
  const now = new Date().toISOString();

  const fields: Record<string, unknown> = {
    userId: uid,
    name: input.name,
    status: input.status,
    performedExercises: input.performedExercises,
    schemaVersion: 2,
    createdAt: ts(now),
    updatedAt: ts(now),
  };
  if (input.date) fields.date = ts(input.date);
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.injuries !== undefined) fields.injuries = input.injuries;
  if (input.status === 'in_progress') fields.startedAt = ts(now);

  try {
    await commit([
      {
        path,
        fields,
        updateMask: Object.keys(fields),
        currentDocument: { exists: false },
      },
    ]);
  } catch (e) {
    if ((e as { status?: number }).status !== 409) throw e;
    // Already created -- by this uid (retry) or, extremely unlikely given
    // client-generated ids, by someone else. Either way surface the current
    // owned state rather than duplicating or silently succeeding for a
    // different user's doc.
    const existing = await getOwnedWorkout(uid, input.id);
    if (!existing) throw new ApiError(409, 'Workout id already in use');
    return toWorkoutDTO(existing);
  }

  const created = await getDoc(path);
  return toWorkoutDTO(created!);
}

/**
 * Merges `patch` onto the existing doc's fields, computing the Firestore
 * `updateMask`. When the patch transitions `status` to 'completed' without
 * explicitly sending `injuries`, ongoing injuries are auto-stamped from
 * `ongoingInjuryIds` — the same rule `wear-action-task.ts finishWorkout` and
 * `active-workout.tsx` apply today. Pure aside from its inputs, so it's unit
 * tested directly without touching Firestore.
 */
export function buildWorkoutUpdate(
  patch: UpdateWorkoutInput,
  ongoingInjuryIds: string[] | undefined
): { fields: Record<string, unknown>; updateMask: string[] } {
  const fields: Record<string, unknown> = { updatedAt: ts(new Date().toISOString()) };
  const updateMask = ['updatedAt'];

  if (patch.name !== undefined) {
    fields.name = patch.name;
    updateMask.push('name');
  }
  if (patch.date !== undefined) {
    fields.date = ts(patch.date);
    updateMask.push('date');
  }
  if (patch.status !== undefined) {
    fields.status = patch.status;
    updateMask.push('status');
  }
  if (patch.notes !== undefined) {
    fields.notes = patch.notes;
    updateMask.push('notes');
  }
  if (patch.performedExercises !== undefined) {
    fields.performedExercises = patch.performedExercises;
    updateMask.push('performedExercises');
  }
  if (patch.injuries !== undefined) {
    fields.injuries = patch.injuries;
    updateMask.push('injuries');
  } else if (patch.status === 'completed' && ongoingInjuryIds) {
    fields.injuries = ongoingInjuryIds;
    updateMask.push('injuries');
  }
  if (patch.status === 'in_progress') {
    fields.startedAt = ts(new Date().toISOString());
    updateMask.push('startedAt');
  }

  return { fields, updateMask };
}

export async function updateWorkout(
  uid: string,
  id: string,
  patch: UpdateWorkoutInput,
  ongoingInjuryIds: string[] | undefined
): Promise<{ conflict: true; remote: WorkoutDTO } | { conflict: false; workout: WorkoutDTO }> {
  const existing = await getOwnedWorkout(uid, id);
  if (!existing) throw new ApiError(404, 'Workout not found');

  if (existing.updateTime !== patch.baseVersion) {
    return { conflict: true, remote: toWorkoutDTO(existing) };
  }

  const { fields, updateMask } = buildWorkoutUpdate(patch, ongoingInjuryIds);

  try {
    await commit([{ path: `${WORKOUTS_COLLECTION}/${id}`, fields, updateMask, currentDocument: { updateTime: existing.updateTime } }]);
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      const remote = await getOwnedWorkout(uid, id);
      return { conflict: true, remote: toWorkoutDTO(remote!) };
    }
    throw e;
  }

  const updated = await getDoc(`${WORKOUTS_COLLECTION}/${id}`);
  return { conflict: false, workout: toWorkoutDTO(updated!) };
}

/** Idempotent: deleting an already-deleted (or never-owned-because-nonexistent) workout is a no-op success. */
export async function deleteWorkout(uid: string, id: string): Promise<void> {
  const existing = await getOwnedWorkout(uid, id);
  if (!existing) return;
  await deleteDoc(`${WORKOUTS_COLLECTION}/${id}`);
}

export async function reorderWorkouts(uid: string, order: { id: string; queueOrder: number }[]): Promise<void> {
  // Read + ownership-check every target first so one write batch never
  // silently skips a doc that belongs to someone else -- fail the whole
  // reorder instead of applying it partially against mixed ownership.
  const docs = await Promise.all(order.map((o) => getOwnedWorkout(uid, o.id)));
  const now = ts(new Date().toISOString());

  const writes = order.map((o, i) => {
    const doc = docs[i];
    if (!doc) throw new ApiError(404, `Workout not found: ${o.id}`);
    return {
      path: `${WORKOUTS_COLLECTION}/${o.id}`,
      fields: { queueOrder: o.queueOrder, updatedAt: now },
      updateMask: ['queueOrder', 'updatedAt'],
      currentDocument: { updateTime: doc.updateTime },
    };
  });

  await commit(writes);
}
