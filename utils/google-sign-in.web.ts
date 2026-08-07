// Web build of utils/google-sign-in.ts. Same two exports, but the browser has
// no native picker — Firebase's own popup flow covers it, and the native module
// is never bundled here.
import { GoogleAuthProvider, linkWithPopup, signInWithPopup, unlink, type User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import {
  assertGoogleLinkIdentity,
  googleProviderEmail,
  hasGoogleProvider,
} from '@/utils/google-account-link';

/** Returns false when the user closed the popup — not an error worth surfacing. */
export async function signInWithGoogle(): Promise<boolean> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
    throw err;
  }
}

/**
 * Web has no pre-link Google account payload: linkWithPopup is Firebase's
 * provider prompt. Verify its resulting provider email and undo the link if
 * it differs from the password account before reporting success.
 */
export async function connectGoogleAccount(user: User): Promise<boolean> {
  const expectedUid = user.uid;
  const accountEmail = user.email;
  const linked = await linkWithPopup(user, new GoogleAuthProvider());
  const googleEmail = googleProviderEmail(linked.user.providerData);

  try {
    assertGoogleLinkIdentity({ expectedUid, linkedUid: linked.user.uid, accountEmail, googleEmail });
  } catch (error) {
    // Do not retain a mismatched provider connection. If unlink itself fails,
    // leave the error actionable and let context re-read provider state rather
    // than claiming this account is safely disconnected.
    if (linked.user.uid === expectedUid && hasGoogleProvider(linked.user.providerData)) {
      await unlink(linked.user, 'google.com');
    }
    throw error;
  }
  return true;
}

/** No cached native account to clear on web; signOut(auth) is the whole story. */
export async function signOutGoogle(): Promise<void> {}
