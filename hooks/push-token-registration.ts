const CACHE_KEY_PREFIX = 'pumppal_expo_push_token';

export interface PushTokenRegistrationDeps {
  getCachedToken: (key: string) => Promise<string | null>;
  setCachedToken: (key: string, token: string) => Promise<void>;
  registerToken: (token: string) => Promise<void>;
}

export function pushTokenCacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}:${uid}`;
}

/**
 * Persists a changed Expo token remotely before caching it locally. Returning
 * false means the same account already registered this exact token.
 */
export async function persistPushToken(
  uid: string,
  token: string,
  deps: PushTokenRegistrationDeps
): Promise<boolean> {
  const cacheKey = pushTokenCacheKey(uid);
  if ((await deps.getCachedToken(cacheKey)) === token) return false;

  await deps.registerToken(token);
  await deps.setCachedToken(cacheKey, token);
  return true;
}
