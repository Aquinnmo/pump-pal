import AsyncStorage from '@react-native-async-storage/async-storage';
// Not importable from `firebase/auth`: that package's export map has no
// `react-native` condition at all. The scoped package does, and Metro resolves
// it to the same single hoisted copy the rest of Firebase Auth already uses
// (@firebase/auth is pinned to firebase's exact 1.13.4 in package.json so a
// second Auth instance can't appear). Its type comes from
// src/types/firebase-auth-rn.d.ts — see that file for why.
import { getReactNativePersistence } from '@firebase/auth';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { setAppCheckTokenProvider } from '@/lib/app-check-token';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/**
 * Native (iOS/Android) Auth. Web uses src/config/firebase.web.ts, which Metro's
 * platform extension resolution picks instead.
 *
 * Without the explicit AsyncStorage persistence, Auth silently falls back to
 * memory persistence: the session is gone on every app restart, and the first
 * sync after relaunch never runs because there is no signed-in user.
 *
 * initializeAuth throws if Auth was already initialized for this app, which
 * Fast Refresh causes routinely — fall back to getAuth rather than crashing.
 */
function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = initAuth();

/**
 * App Check (native). Mirrors the reCAPTCHA registration in
 * src/config/firebase.web.ts, but the token has to come from
 * @react-native-firebase: Play Integrity and App Attest are native APIs the JS
 * SDK cannot reach, so this deliberately runs a second Firebase app instance
 * configured from google-services.json rather than `firebaseConfig` above. Only
 * the App Check token crosses over; Auth and Firestore stay on the JS SDK.
 *
 * Wrapped in try/catch because the native module exists only in a dev or
 * production build. Against Expo Go or a stale binary the require throws, and
 * App Check must degrade to "send no token" rather than break app startup —
 * the Worker is on APP_CHECK_MODE=monitor, so an absent token still works.
 *
 * iOS additionally needs `@react-native-firebase/app-check` in app.json's
 * plugin list: its config plugin injects `[RNFBAppCheckModule sharedInstance]`
 * into the AppDelegate ahead of `FirebaseApp.configure()`, which is what
 * installs the provider factory. Autolinking the pod is not enough — without
 * the plugin the code below runs, mints nothing, and prints no debug token.
 */
function initAppCheck(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeAppCheck, getToken, ReactNativeFirebaseAppCheckProvider } = require('@react-native-firebase/app-check');
    const provider = new ReactNativeFirebaseAppCheckProvider();
    // Play Integrity / App Attest only attest a Play Store / TestFlight-distributed
    // binary with a matching signing cert — a sideloaded `eas build --local` preview
    // APK always fails with "App attestation failed" (403), throttling every retry
    // after. EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN opts a non-dev build (preview) into
    // the debug provider too; that token must be registered in Firebase console
    // under App Check > the app > Manage debug tokens.
    const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;
    const useDebugProvider = __DEV__ || !!debugToken;
    provider.configure({
      android: useDebugProvider ? { provider: 'debug', debugToken } : { provider: 'playIntegrity' },
      apple: useDebugProvider ? { provider: 'debug', debugToken } : { provider: 'appAttestWithDeviceCheckFallback' },
    });
    // initializeAppCheck returns synchronously (native setup continues in the
    // background); no readiness promise to await before the first getToken.
    const appCheckInstance = initializeAppCheck(undefined, { provider, isTokenAutoRefreshEnabled: true });
    setAppCheckTokenProvider(async () => (await getToken(appCheckInstance)).token);
  } catch (error) {
    if (__DEV__) console.warn('[app-check] native module unavailable; requests send no token', error);
  }
}

initAppCheck();

export default app;
