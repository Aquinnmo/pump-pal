import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { ReCaptchaEnterpriseProvider, getToken, initializeAppCheck } from 'firebase/app-check';
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

// Web: `getAuth` already persists to browser storage, and the React Native
// persistence helper (see src/config/firebase.ts) must never reach this bundle —
// it would drag AsyncStorage in with it.
export const auth = getAuth(app);

const siteKey = process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (siteKey) {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  setAppCheckTokenProvider(async () => (await getToken(appCheck)).token);
}

export default app;
