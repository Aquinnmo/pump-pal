// Native Sign in with Apple, iOS only — the button and settings row render
// nothing elsewhere, so there is no .web.ts split.
//
// Like Google, the native module only obtains an identity token; Firebase (JS
// SDK) exchanges it. Apple checks the SHA-256 of the nonce we send against the
// `nonce` claim in the token, and Firebase checks the raw nonce against the
// same claim, so a stolen token cannot be replayed.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  linkWithCredential,
  revokeAccessToken,
  signInWithCredential,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AppleLinkUserChangedError } from '@/lib/apple-account-link';

/** False off iOS: the module stubs isAvailableAsync to false on web and Android. */
export function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

/** Runs the native Apple sheet. Null when the user dismissed it. */
async function requestAppleCredential() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!apple.identityToken) throw new Error('Apple did not return an identity token.');
    return {
      apple,
      credential: new OAuthProvider('apple.com').credential({ idToken: apple.identityToken, rawNonce }),
    };
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }
}

/** Returns false when the user dismissed the sheet — not an error worth surfacing. */
export async function signInWithApple(): Promise<boolean> {
  const result = await requestAppleCredential();
  if (!result) return false;

  const { user } = await signInWithCredential(auth, result.credential);
  // Apple sends the name only on the very first authorization, so this is the
  // one chance to keep it.
  const { givenName, familyName } = result.apple.fullName ?? {};
  const displayName = [givenName, familyName].filter(Boolean).join(' ');
  if (displayName && !user.displayName) await updateProfile(user, { displayName }).catch(() => {});
  return true;
}

/**
 * Links the selected Apple identity to this signed-in user. No email match, unlike
 * Google: Apple usually returns a private-relay address that can never equal the
 * account email, and the user started this while signed in, so there is no silent
 * merge to guard against.
 */
export async function connectAppleAccount(user: User): Promise<boolean> {
  const result = await requestAppleCredential();
  if (!result) return false;

  if (auth.currentUser?.uid !== user.uid) throw new AppleLinkUserChangedError();
  const linked = await linkWithCredential(user, result.credential);
  if (linked.user.uid !== user.uid) throw new AppleLinkUserChangedError();
  return true;
}

/**
 * Apple requires revoking its token when the account is deleted (App Store
 * 5.1.1(v)). Needs a fresh authorization code, so this re-runs the Apple sheet.
 * Returns false when the user dismissed it.
 */
export async function revokeAppleAccess(): Promise<boolean> {
  const result = await requestAppleCredential();
  if (!result) return false;
  if (!result.apple.authorizationCode) throw new Error('Apple did not return an authorization code.');
  await revokeAccessToken(auth, result.apple.authorizationCode);
  return true;
}
