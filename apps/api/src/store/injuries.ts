import type { CreateInjuryInput, InjuryDTO, UpdateInjuryInput } from '@timber/contract/api';
import { ApiError } from '../http.js';
import { commit, getDoc, runQuery, ts, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * Injuries live as a flat array on `users/{uid}.injuries` (see
 * docs/data-model/users.md), not their own collection — every op here is a
 * read-modify-write of that one array field, versioned by the user doc's
 * `updateTime`, same optimistic-concurrency shape as `store/quota.ts`.
 */

const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts';
const MAX_ATTEMPTS = 3;

function toInjuryDTO(raw: DecodedValue): InjuryDTO {
  const r = raw as Record<string, DecodedValue>;
  return {
    id: String(r.id ?? ''),
    bodyPart: r.bodyPart as InjuryDTO['bodyPart'],
    side: r.side as InjuryDTO['side'] | undefined,
    muscles: Array.isArray(r.muscles) ? (r.muscles as string[]) : undefined,
    severity: r.severity as InjuryDTO['severity'],
    status: r.status as InjuryDTO['status'],
    onsetDate: r.onsetDate as string,
    resolvedDate: (r.resolvedDate as string | null) ?? undefined,
    avoid: Array.isArray(r.avoid) ? (r.avoid as string[]) : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

async function getUserDoc(uid: string): Promise<FirestoreDoc | undefined> {
  return getDoc(`${USERS_COLLECTION}/${uid}`, ['injuries']);
}

function injuriesFromDoc(doc: FirestoreDoc | undefined): InjuryDTO[] {
  const raw = doc?.fields.injuries;
  return Array.isArray(raw) ? raw.map(toInjuryDTO) : [];
}

export async function listInjuries(uid: string): Promise<{ injuries: InjuryDTO[]; version: string }> {
  const doc = await getUserDoc(uid);
  return { injuries: injuriesFromDoc(doc), version: doc?.updateTime ?? '' };
}

/** Pure: append, rejecting a duplicate id outright rather than silently overwriting it. */
export function nextInjuriesAfterCreate(existing: InjuryDTO[], created: InjuryDTO): InjuryDTO[] {
  if (existing.some((i) => i.id === created.id)) {
    throw new ApiError(409, `Injury id already exists: ${created.id}`, 'conflict');
  }
  return [...existing, created];
}

/** Pure: merge `patch` onto the matching injury; throws 404 if the id isn't present. */
export function nextInjuriesAfterUpdate(existing: InjuryDTO[], id: string, patch: UpdateInjuryInput, nowIso: string): InjuryDTO[] {
  const idx = existing.findIndex((i) => i.id === id);
  if (idx === -1) throw new ApiError(404, `Injury not found: ${id}`);
  const { baseVersion: _baseVersion, ...edits } = patch;
  const merged: InjuryDTO = { ...existing[idx], ...edits, updatedAt: nowIso };
  const next = [...existing];
  next[idx] = merged;
  return next;
}

/** Pure: idempotent removal — removing an already-absent id is a no-op, not an error (safe retry). */
export function nextInjuriesAfterDelete(existing: InjuryDTO[], id: string): InjuryDTO[] {
  return existing.filter((i) => i.id !== id);
}

export async function createInjury(uid: string, input: CreateInjuryInput): Promise<{ injury: InjuryDTO; version: string }> {
  const now = new Date().toISOString();
  const injury: InjuryDTO = { ...input, resolvedDate: input.resolvedDate ?? undefined, createdAt: now, updatedAt: now };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await getUserDoc(uid);
    const existing = injuriesFromDoc(doc);
    // Retried create with the same id: already applied, acknowledge it.
    const already = existing.find((i) => i.id === input.id);
    if (already) return { injury: already, version: doc?.updateTime ?? '' };

    const next = nextInjuriesAfterCreate(existing, injury);
    try {
      await commit([
        {
          path: `${USERS_COLLECTION}/${uid}`,
          fields: { injuries: next },
          updateMask: ['injuries'],
          currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
        },
      ]);
    } catch (e) {
      if ((e as { status?: number }).status === 409 && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
    const updated = await getUserDoc(uid);
    return { injury, version: updated?.updateTime ?? '' };
  }
  throw new Error('createInjury: exhausted retries');
}

export async function updateInjury(
  uid: string,
  id: string,
  patch: UpdateInjuryInput
): Promise<
  | { conflict: true; remote: InjuryDTO[]; remoteVersion: string }
  | { conflict: false; injury: InjuryDTO; version: string }
> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await getUserDoc(uid);
    if (patch.baseVersion && doc?.updateTime !== patch.baseVersion) {
      return { conflict: true, remote: injuriesFromDoc(doc), remoteVersion: doc?.updateTime ?? '' };
    }

    const existing = injuriesFromDoc(doc);
    const next = nextInjuriesAfterUpdate(existing, id, patch, new Date().toISOString());

    try {
      await commit([
        {
          path: `${USERS_COLLECTION}/${uid}`,
          fields: { injuries: next },
          updateMask: ['injuries'],
          currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
        },
      ]);
    } catch (e) {
      if ((e as { status?: number }).status === 409 && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }

    const updated = next.find((i) => i.id === id)!;
    const updatedDoc = await getUserDoc(uid);
    return { conflict: false, injury: updated, version: updatedDoc?.updateTime ?? '' };
  }
  throw new Error('updateInjury: exhausted retries');
}

/** Idempotent: deleting an already-absent injury id is a no-op success. */
export async function deleteInjury(uid: string, id: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await getUserDoc(uid);
    const existing = injuriesFromDoc(doc);
    if (!existing.some((i) => i.id === id)) return;

    const next = nextInjuriesAfterDelete(existing, id);
    try {
      await commit([
        {
          path: `${USERS_COLLECTION}/${uid}`,
          fields: { injuries: next },
          updateMask: ['injuries'],
          currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
        },
      ]);
      return;
    } catch (e) {
      if ((e as { status?: number }).status === 409 && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }
  throw new Error('deleteInjury: exhausted retries');
}

// --------------------------------------------------------- history stamping

/**
 * Does a workout logged on `workoutDateIso` fall inside `[onsetIso, resolvedIso ?? now]`?
 * Pure port of `utils/injuries.ts` `injuryCoversDate`, operating on ISO
 * strings instead of Firestore Timestamps since that's the wire/DTO shape here.
 */
export function workoutInInjuryWindow(workoutDateIso: string | undefined, onsetIso: string, resolvedIso: string | null | undefined): boolean {
  if (!workoutDateIso) return false; // planned/in_progress workouts have no date -- not history
  const t = Date.parse(workoutDateIso);
  const start = Date.parse(onsetIso);
  const end = resolvedIso ? Date.parse(resolvedIso) : Date.now();
  return t >= start && t <= end;
}

async function getOwnedWorkoutsWithUserId(uid: string): Promise<FirestoreDoc[]> {
  return runQuery({
    collectionId: WORKOUTS_COLLECTION,
    where: [{ field: 'userId', op: 'EQUAL', value: uid }],
    limit: 5000,
  });
}

/** arrayUnion semantics via read-modify-write + retry (same shape as quota.ts) — idempotent, re-applying never duplicates. */
async function stampWorkoutInjury(path: string, injuryId: string, add: boolean): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await getDoc(path, ['injuries']);
    if (!doc) return;
    const current = Array.isArray(doc.fields.injuries) ? (doc.fields.injuries as string[]) : [];
    const has = current.includes(injuryId);
    if (add === has) return; // already in the desired state
    const next = add ? [...current, injuryId] : current.filter((i) => i !== injuryId);

    try {
      await commit([{ path, fields: { injuries: next }, updateMask: ['injuries'], currentDocument: { updateTime: doc.updateTime } }]);
      return;
    } catch (e) {
      if ((e as { status?: number }).status === 409 && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }
}

/** Stamps `injuryId` onto every completed workout in its onset/resolved window. Returns the affected workout ids. Idempotent. */
export async function applyInjuryToHistory(uid: string, injury: Pick<InjuryDTO, 'id' | 'onsetDate' | 'resolvedDate'>): Promise<string[]> {
  const docs = await getOwnedWorkoutsWithUserId(uid);
  const targets = docs.filter((d) => workoutInInjuryWindow(d.fields.date as string | undefined, injury.onsetDate, injury.resolvedDate ?? null));
  await Promise.all(targets.map((d) => stampWorkoutInjury(d.path, injury.id, true)));
  return targets.map((d) => d.path.split('/').pop()!);
}

/** Removes `injuryId` from every workout that currently carries it. Returns the affected workout ids. Idempotent. */
export async function removeInjuryFromHistory(uid: string, injuryId: string): Promise<string[]> {
  const docs = await getOwnedWorkoutsWithUserId(uid);
  const targets = docs.filter((d) => (Array.isArray(d.fields.injuries) ? (d.fields.injuries as string[]) : []).includes(injuryId));
  await Promise.all(targets.map((d) => stampWorkoutInjury(d.path, injuryId, false)));
  return targets.map((d) => d.path.split('/').pop()!);
}
