// Tokens are short-lived credentials. Keep only an in-memory provider; never
// persist a token in SQLite, AsyncStorage, or logs.
let provider: (() => Promise<string | null>) | undefined;

export function setAppCheckTokenProvider(next: (() => Promise<string | null>) | undefined): void {
  provider = next;
}

export async function getAppCheckToken(): Promise<string | null> {
  if (!provider) {
    // Expected in Expo Go or a stale binary (see src/config/firebase.ts), but
    // silent here makes a local enforce-mode 401 look like a mystery instead
    // of "no token was ever sent". Never breaks anything — still returns null.
    if (__DEV__) console.warn('[app-check] no token provider registered; request will send no token');
    return null;
  }
  try {
    return await provider();
  } catch (error) {
    if (__DEV__) console.warn('[app-check] token provider threw; request will send no token', error);
    return null;
  }
}
