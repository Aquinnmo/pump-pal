// Web build of utils/google-sign-in.ts. Same two exports, but the browser has
// no native picker — Firebase's own popup flow covers it, and the native module
// is never bundled here.
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/config/firebase';

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

/** No cached native account to clear on web; signOut(auth) is the whole story. */
export async function signOutGoogle(): Promise<void> {}
