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
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '@/config/firebase';

// Public identifiers, not secrets — they ship inside every APK/IPA regardless.
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
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

/** Clears the cached Google account so the next sign-in shows the picker again. */
export async function signOutGoogle(): Promise<void> {
  await GoogleSignin.signOut().catch(() => {});
}
