import type { CreateInjuryInput, InjuryDTO, UpdateInjuryInput } from '@timber/contract/api';
import { firestorePaths } from '@timber/contract/firestore';
import { ApiError } from '../errors.js';
import { commit, deleteDoc, getDoc, runQuery, ts, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * Canonical injuries are independent documents at
 * `users/{uid}/injuries/{injuryId}`, so each record carries its own
 * Firestore updateTime. During the bounded copy-before-cleanup migration,
 * a user with no new injury docs still reads the old array.
 */

const WORKOUTS_COLLECTION = 'workouts';

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

function injuriesFromLegacyDoc(doc: FirestoreDoc | undefined): InjuryDTO[] {
  const raw = doc?.fields.injuries;
  return Array.isArray(raw) ? raw.map(toInjuryDTO) : [];
}

function injuryFromDoc(doc: FirestoreDoc): InjuryDTO {
  return toInjuryDTO(doc.fields);
}

async function getNewInjuryDocs(uid: string): Promise<FirestoreDoc[]> {
  return runQuery({ parentPath: firestorePaths.user(uid), collectionId: 'injuries', limit: 5_000 });
}

async function getLegacyInjuries(uid: string): Promise<InjuryDTO[]> {
  return injuriesFromLegacyDoc(await getDoc(firestorePaths.user(uid), ['injuries']));
}

async function getInjuryDoc(uid: string, id: string): Promise<FirestoreDoc | undefined> {
  return getDoc(firestorePaths.injury(uid, id));
}

/** New documents win; the old array is only a pre-copy compatibility fallback. */
export async function listInjuries(uid: string): Promise<{ injuries: InjuryDTO[]; version: string }> {
  const docs = await getNewInjuryDocs(uid);
  if (docs.length > 0) {
    const injuries = docs.map(injuryFromDoc);
    return { injuries, version: docs.map((doc) => doc.updateTime).sort().at(-1) ?? '' };
  }
  const legacy = await getDoc(firestorePaths.user(uid), ['injuries']);
  return { injuries: injuriesFromLegacyDoc(legacy), version: legacy?.updateTime ?? '' };
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
  const path = firestorePaths.injury(uid, input.id);
  const existing = await getInjuryDoc(uid, input.id);
  if (existing) return { injury: injuryFromDoc(existing), version: existing.updateTime };

  // A retried create during migration may still find its legacy array item.
  const legacy = (await getLegacyInjuries(uid)).find((item) => item.id === input.id);
  if (legacy) {
    await commit([{ path, fields: legacy, updateMask: Object.keys(legacy), currentDocument: { exists: false } }]);
    const copied = await getInjuryDoc(uid, input.id);
    if (!copied) throw new Error('Legacy injury copy completed without a readable document');
    return { injury: injuryFromDoc(copied), version: copied.updateTime };
  }

  try {
    await commit([{ path, fields: injury, updateMask: Object.keys(injury), currentDocument: { exists: false } }]);
  } catch (error) {
    if ((error as { status?: number }).status !== 409) throw error;
    const raced = await getInjuryDoc(uid, input.id);
    if (raced) return { injury: injuryFromDoc(raced), version: raced.updateTime };
    throw error;
  }
  const created = await getInjuryDoc(uid, input.id);
  if (!created) throw new Error('Injury write completed without a readable document');
  return { injury: injuryFromDoc(created), version: created.updateTime };
}

export async function updateInjury(
  uid: string,
  id: string,
  patch: UpdateInjuryInput
): Promise<
  | { conflict: true; remote: InjuryDTO; remoteVersion: string }
  | { conflict: false; injury: InjuryDTO; version: string }
> {
  const path = firestorePaths.injury(uid, id);
  const doc = await getInjuryDoc(uid, id);
  if (doc) {
    const existing = injuryFromDoc(doc);
    if (patch.baseVersion && doc.updateTime !== patch.baseVersion) return { conflict: true, remote: existing, remoteVersion: doc.updateTime };
    const next = nextInjuriesAfterUpdate([existing], id, patch, new Date().toISOString())[0];
    try {
      await commit([{ path, fields: next, updateMask: Object.keys(next), currentDocument: { updateTime: doc.updateTime } }]);
    } catch (error) {
      if ((error as { status?: number }).status !== 409) throw error;
      const remote = await getInjuryDoc(uid, id);
      if (!remote) throw new ApiError(404, 'Injury not found');
      return { conflict: true, remote: injuryFromDoc(remote), remoteVersion: remote.updateTime };
    }
    const updated = await getInjuryDoc(uid, id);
    if (!updated) throw new Error('Injury write completed without a readable document');
    return { conflict: false, injury: injuryFromDoc(updated), version: updated.updateTime };
  }

  // A legacy-only row is copied to its new document on its first edit.
  const legacy = (await getLegacyInjuries(uid)).find((item) => item.id === id);
  if (!legacy) throw new ApiError(404, 'Injury not found');
  const next = nextInjuriesAfterUpdate([legacy], id, patch, new Date().toISOString())[0];
  await commit([{ path, fields: next, updateMask: Object.keys(next), currentDocument: { exists: false } }]);
  const updated = await getInjuryDoc(uid, id);
  if (!updated) throw new Error('Injury migration write completed without a readable document');
  return { conflict: false, injury: injuryFromDoc(updated), version: updated.updateTime };
}

/** Idempotent: deleting an already-absent injury id is a no-op success. */
export async function deleteInjury(uid: string, id: string): Promise<void> {
  await deleteDoc(firestorePaths.injury(uid, id));
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
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if ((e as { status?: number }).status === 409 && attempt < 2) continue;
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
