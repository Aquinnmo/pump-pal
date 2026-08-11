import type { DeleteAccountDataResponse } from '@timber/contract/api';
import { deleteDoc, getDoc, runQuery } from './rest.js';

/**
 * Server-side port of `app/settings-account.tsx confirmDeleteAccount`'s
 * Firestore cleanup, same order: canonical `workouts` (by `userId`), the
 * legacy `users/{uid}/workouts/*` subcollection, `users/{uid}/pushup-
 * challenge/data`, the `usernames/{usernameLower}` reservation, every
 * `friendships` doc the user belongs to, then `users/{uid}` itself. Does NOT delete the Firebase Auth user -- that
 * stays a client `deleteUser(auth.currentUser)` call, invoked only after
 * this succeeds.
 *
 * Every phase runs even if an earlier one fails (best-effort, not
 * fail-fast) and every phase is independently idempotent (`deleteDoc`
 * treats 404 as success, a query over an already-emptied collection just
 * returns fewer docs) — so a caller that sees `partial: true` can retry the
 * whole call safely instead of needing to know which phase to resume from.
 * The username reservation phase must run before `deleteUserDoc` — it reads
 * `usernameLower` off the user doc, which `deleteUserDoc` removes.
 */
export interface AccountDeletionPhases {
  deleteWorkouts(uid: string): Promise<number>;
  deleteLegacyWorkouts(uid: string): Promise<number>;
  deletePushupChallenge(uid: string): Promise<void>;
  deleteFriendships(uid: string): Promise<number>;
  deleteUsernameReservation(uid: string): Promise<void>;
  deleteUserDoc(uid: string): Promise<void>;
}

const realPhases: AccountDeletionPhases = {
  async deleteWorkouts(uid) {
    const docs = await runQuery({ collectionId: 'workouts', where: [{ field: 'userId', op: 'EQUAL', value: uid }], limit: 5000 });
    await Promise.all(docs.map((d) => deleteDoc(d.path)));
    return docs.length;
  },
  async deleteLegacyWorkouts(uid) {
    const docs = await runQuery({ parentPath: `users/${uid}`, collectionId: 'workouts', limit: 5000 });
    await Promise.all(docs.map((d) => deleteDoc(d.path)));
    return docs.length;
  },
  async deletePushupChallenge(uid) {
    await deleteDoc(`users/${uid}/pushup-challenge/data`);
  },
  async deleteFriendships(uid) {
    // Deletes the shared doc outright, so the buddy on the other side loses
    // the relationship too -- correct, since half a friendship isn't a thing.
    // Queried inline rather than through store/buddies.ts so this module stays
    // free of that file's `http.js` (and therefore env-var) dependency.
    const docs = await runQuery({
      collectionId: 'friendships',
      where: [{ field: 'users', op: 'ARRAY_CONTAINS', value: uid }],
      limit: 5000,
    });
    await Promise.all(docs.map((d) => deleteDoc(d.path)));
    return docs.length;
  },
  async deleteUsernameReservation(uid) {
    const doc = await getDoc(`users/${uid}`);
    const usernameLower = doc?.fields.usernameLower as string | undefined;
    if (usernameLower) await deleteDoc(`usernames/${usernameLower}`);
  },
  async deleteUserDoc(uid) {
    await deleteDoc(`users/${uid}`);
  },
};

/**
 * The orchestration logic, with the Firestore phases injected so it's
 * unit-testable without a live Firestore connection (there isn't one in this
 * sandbox). `deleteAccountData` below is the real entry point; tests call
 * this directly with mock phases.
 */
export async function deleteAccountDataWith(uid: string, phases: AccountDeletionPhases): Promise<DeleteAccountDataResponse> {
  const deleted = { workouts: 0, legacyWorkouts: 0, pushupChallenge: false, friendships: 0, userDoc: false };
  let partial = false;

  try {
    await phases.deleteUsernameReservation(uid);
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting username reservation`, e);
  }

  try {
    deleted.workouts = await phases.deleteWorkouts(uid);
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting workouts`, e);
  }

  try {
    deleted.legacyWorkouts = await phases.deleteLegacyWorkouts(uid);
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting legacy workouts`, e);
  }

  try {
    await phases.deletePushupChallenge(uid);
    deleted.pushupChallenge = true;
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting pushup-challenge`, e);
  }

  try {
    deleted.friendships = await phases.deleteFriendships(uid);
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting friendships`, e);
  }

  try {
    await phases.deleteUserDoc(uid);
    deleted.userDoc = true;
  } catch (e) {
    partial = true;
    console.error(`deleteAccountData(${uid}): failed deleting user doc`, e);
  }

  return { deleted, partial };
}

export function deleteAccountData(uid: string): Promise<DeleteAccountDataResponse> {
  return deleteAccountDataWith(uid, realPhases);
}
