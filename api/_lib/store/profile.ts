import type { InjuryDTO, ProfileDTO, ProfilePatchInput } from '../../../shared/api-contract.js';
import { commit, getDoc, ts, type DecodedValue, type FirestoreDoc } from './rest.js';
import { listInjuries } from './injuries.js';

/**
 * `users/{uid}` profile read/patch. The doc may not exist yet (see
 * docs/data-model/users.md — "the doc doesn't exist until onboarding
 * completes"); every reader here treats that identically to "doc exists but
 * empty", same as the client's existing `snapshot.data()?.workoutSplit?.type` reads.
 */

const USERS_COLLECTION = 'users';

function toProfileDTO(doc: FirestoreDoc | undefined): ProfileDTO {
  const workoutSplit = doc?.fields.workoutSplit as Record<string, DecodedValue> | undefined;
  const aiUsage = doc?.fields.aiUsage as Record<string, DecodedValue> | undefined;
  return {
    workoutSplit: workoutSplit
      ? { type: workoutSplit.type as NonNullable<ProfileDTO['workoutSplit']>['type'], custom: (workoutSplit.custom as string | null) ?? null }
      : null,
    aiUsage: aiUsage ? { date: aiUsage.date as string, count: Number(aiUsage.count) } : null,
    version: doc?.updateTime ?? '',
  };
}

export async function getProfile(uid: string): Promise<ProfileDTO> {
  const doc = await getDoc(`${USERS_COLLECTION}/${uid}`);
  return toProfileDTO(doc);
}

export async function updateProfile(
  uid: string,
  patch: ProfilePatchInput
): Promise<{ conflict: true; remote: ProfileDTO } | { conflict: false; profile: ProfileDTO }> {
  const doc = await getDoc(`${USERS_COLLECTION}/${uid}`);

  if (patch.baseVersion && doc?.updateTime !== patch.baseVersion) {
    return { conflict: true, remote: toProfileDTO(doc) };
  }

  const fields: Record<string, unknown> = {};
  const updateMask: string[] = [];
  if (patch.workoutSplit !== undefined) {
    fields.workoutSplit = { ...patch.workoutSplit, updatedAt: ts(new Date().toISOString()) };
    updateMask.push('workoutSplit');
  }
  if (updateMask.length === 0) return { conflict: false, profile: toProfileDTO(doc) };

  try {
    await commit([
      {
        path: `${USERS_COLLECTION}/${uid}`,
        fields,
        updateMask,
        currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
      },
    ]);
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      const remote = await getDoc(`${USERS_COLLECTION}/${uid}`);
      return { conflict: true, remote: toProfileDTO(remote) };
    }
    throw e;
  }

  const updated = await getDoc(`${USERS_COLLECTION}/${uid}`);
  return { conflict: false, profile: toProfileDTO(updated) };
}

/** Ongoing injuries only — used to auto-stamp `workouts/{id}.injuries` on completion (see workouts.ts). */
export async function getOngoingInjuries(uid: string): Promise<InjuryDTO[]> {
  const { injuries } = await listInjuries(uid);
  return injuries.filter((i) => i.status === 'ongoing');
}
