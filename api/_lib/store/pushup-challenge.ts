import type { PushupChallengeDTO, PutPushupChallengeInput } from '../../../shared/api-contract.js';
import { commit, getDoc, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * `users/{uid}/pushup-challenge/data` -- a single fixed doc (see
 * docs/data-model/pushup-challenge.md). The client today does an unversioned
 * `setDoc` full replace; this keeps that default (omit `baseVersion` = last-
 * write-wins) while adding optional optimistic concurrency for callers that
 * want it.
 */

function path(uid: string): string {
  return `users/${uid}/pushup-challenge/data`;
}

function toDTO(doc: FirestoreDoc | undefined): PushupChallengeDTO {
  if (!doc) return { startDate: null, days: [], longestStreak: 0, version: null };
  const f = doc.fields;
  return {
    startDate: (f.startDate as string) ?? null,
    days: (Array.isArray(f.days) ? f.days : []).map((d) => {
      const r = d as Record<string, DecodedValue>;
      return { date: String(r.date ?? ''), dayNumber: Number(r.dayNumber ?? 0), completedAt: String(r.completedAt ?? '') };
    }),
    longestStreak: Number(f.longestStreak ?? 0),
    version: doc.updateTime,
  };
}

export async function getChallenge(uid: string): Promise<PushupChallengeDTO> {
  return toDTO(await getDoc(path(uid)));
}

/**
 * Pure: does `baseVersion` conflict with the existing doc's version?
 * - `undefined` (omitted): last-write-wins, matching the client's current
 *   unversioned `setDoc` -- never a conflict.
 * - `null`: caller believes there's no doc yet (first-writer-wins create) --
 *   conflicts if one already exists.
 * - a string: real optimistic concurrency -- conflicts unless it matches.
 */
export function hasBaseVersionConflict(baseVersion: string | null | undefined, existingVersion: string | undefined): boolean {
  if (baseVersion === undefined) return false;
  if (baseVersion === null) return existingVersion !== undefined;
  return existingVersion !== baseVersion;
}

export async function putChallenge(
  uid: string,
  input: PutPushupChallengeInput
): Promise<{ conflict: true; remote: PushupChallengeDTO } | { conflict: false; challenge: PushupChallengeDTO }> {
  const existing = await getDoc(path(uid));

  if (hasBaseVersionConflict(input.baseVersion, existing?.updateTime)) {
    return { conflict: true, remote: toDTO(existing) };
  }

  const fields = { startDate: input.startDate, days: input.days, longestStreak: input.longestStreak };
  const currentDocument =
    input.baseVersion === null
      ? { exists: false }
      : typeof input.baseVersion === 'string'
        ? { updateTime: input.baseVersion }
        : undefined;

  try {
    await commit([{ path: path(uid), fields, updateMask: Object.keys(fields), ...(currentDocument ? { currentDocument } : {}) }]);
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      return { conflict: true, remote: toDTO(await getDoc(path(uid))) };
    }
    throw e;
  }

  return { conflict: false, challenge: toDTO(await getDoc(path(uid))) };
}
