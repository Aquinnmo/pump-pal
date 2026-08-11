import type { InjuryDTO, ProfileDTO, ProfilePatchInput } from '@timber/contract/api';
import { USERNAME_REGEX } from '@timber/contract/username';
import { ApiError } from '../http.js';
import { commit, getDoc, ts, type DecodedValue, type FirestoreDoc, type FirestoreWrite } from './rest.js';
import { listInjuries } from './injuries.js';

/**
 * `users/{uid}` profile read/patch. The doc may not exist yet (see
 * docs/data-model/users.md — "the doc doesn't exist until onboarding
 * completes"); every reader here treats that identically to "doc exists but
 * empty", same as the client's existing `snapshot.data()?.workoutSplit?.type` reads.
 */

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';

function toProfileDTO(doc: FirestoreDoc | undefined): ProfileDTO {
  const workoutSplit = doc?.fields.workoutSplit as Record<string, DecodedValue> | undefined;
  const aiUsage = doc?.fields.aiUsage as Record<string, DecodedValue> | undefined;
  return {
    workoutSplit: workoutSplit
      ? { type: workoutSplit.type as NonNullable<ProfileDTO['workoutSplit']>['type'], custom: (workoutSplit.custom as string | null) ?? null }
      : null,
    username: (doc?.fields.username as string | undefined) ?? null,
    aiUsage: aiUsage ? { date: aiUsage.date as string, count: Number(aiUsage.count) } : null,
    version: doc?.updateTime ?? '',
  };
}

export async function getProfile(uid: string): Promise<ProfileDTO> {
  const doc = await getDoc(`${USERS_COLLECTION}/${uid}`);
  return toProfileDTO(doc);
}

function usernameTakenError(): ApiError {
  return new ApiError(422, 'That username is taken. Try another.', 'username_taken');
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

  if (patch.expoPushToken !== undefined) {
    fields.expoPushToken = patch.expoPushToken;
    updateMask.push('expoPushToken');
  }

  const extraWrites: FirestoreWrite[] = [];
  let newLower: string | undefined;
  const currentLower = doc?.fields.usernameLower as string | undefined;

  if (patch.username !== undefined) {
    if (!USERNAME_REGEX.test(patch.username)) {
      throw new ApiError(400, 'Username must be 3-20 characters: letters, digits, underscore, starting with a letter.', 'invalid_username');
    }
    newLower = patch.username.toLowerCase();

    if (newLower !== currentLower) {
      // Fast-fail check. The real uniqueness guard is the `currentDocument:
      // { exists: false }` precondition on the commit below — this pre-check
      // just avoids the auth-account-created-then-username-taken path for the
      // common case without a wasted round trip.
      const existing = await getDoc(`${USERNAMES_COLLECTION}/${newLower}`);
      if (existing && existing.fields.uid !== uid) throw usernameTakenError();

      fields.username = patch.username;
      fields.usernameLower = newLower;
      updateMask.push('username', 'usernameLower');

      extraWrites.push({
        path: `${USERNAMES_COLLECTION}/${newLower}`,
        fields: { uid, username: patch.username, createdAt: ts(new Date().toISOString()) },
        updateMask: ['uid', 'username', 'createdAt'],
        currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false },
      });
      if (currentLower) extraWrites.push({ path: `${USERNAMES_COLLECTION}/${currentLower}`, delete: true });
    }
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
      ...extraWrites,
    ]);
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      // The batch's 409 doesn't say which write's precondition failed --
      // disambiguate by re-checking the reservation doc.
      if (newLower) {
        const stillContested = await getDoc(`${USERNAMES_COLLECTION}/${newLower}`);
        if (stillContested && stillContested.fields.uid !== uid) throw usernameTakenError();
      }
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
