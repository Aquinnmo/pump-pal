// Native Google sign-in. Web build: utils/google-sign-in.web.ts — same two
// exports backed by signInWithPopup, so the native module never reaches the
// web bundle (same Metro platform-extension split as config/firebase.web.ts).
//
// This app uses the Firebase JS SDK, not react-native-firebase, so the native
// module's only job is to obtain a Google ID token; the token is then exchanged
// for a Firebase credential here. That means no google-services.json /
// GoogleService-Info.plist — just the OAuth client IDs below, plus the SHA-1
// fingerprints registered in the Firebase console (without them Android sign-in
// fails with DEVELOPER_ERROR, status code 10).
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, linkWithCredential, signInWithCredential, type User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getGoogleOAuthConfig } from '@/config/google-oauth';
import { assertGoogleLinkIdentity } from '@/utils/google-account-link';

// Public identifiers, not secrets — they ship inside every APK/IPA regardless.
//
// Each variable must be read as a literal `process.env.EXPO_PUBLIC_*` member
// expression. Metro inlines those as string literals at build time; there is no
// runtime env object in a release bundle. Passing `process.env` itself to
// getGoogleOAuthConfig inlines nothing, so both IDs came back undefined in the
// APK — sign-in then failed with "Google did not return an ID token" while a
// dev build (whose dev server injects a real env) worked fine.
const { webClientId, iosClientId } = getGoogleOAuthConfig({
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});
GoogleSignin.configure({
  webClientId,
  iosClientId,
});

/** Returns false when the user dismissed the picker — not an error worth surfacing. */
export async function signInWithGoogle(): Promise<boolean> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type === 'cancelled') return false;

  const idToken = result.data.idToken;
  // webClientId missing/mismatched is the usual cause, and it surfaces here
  // rather than as a throw from the native module.
  if (!idToken) throw new Error('Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');

  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  return true;
}

/** Links the selected Google identity to this existing Firebase user. */
export async function connectGoogleAccount(user: User): Promise<boolean> {
  const expectedUid = user.uid;
  const accountEmail = user.email;
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type === 'cancelled') return false;

  const idToken = result.data.idToken;
  if (!idToken) throw new Error('Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');

  assertGoogleLinkIdentity({
    expectedUid,
    linkedUid: auth.currentUser?.uid ?? '',
    accountEmail,
    googleEmail: result.data.user.email,
  });
  const linked = await linkWithCredential(user, GoogleAuthProvider.credential(idToken));
  assertGoogleLinkIdentity({
    expectedUid,
    linkedUid: linked.user.uid,
    accountEmail,
    googleEmail: result.data.user.email,
  });
  return true;
}

/** Clears the cached Google account so the next sign-in shows the picker again. */
export async function signOutGoogle(): Promise<void> {
  await GoogleSignin.signOut().catch(() => {});
}
