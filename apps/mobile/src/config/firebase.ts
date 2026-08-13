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

export default app;
