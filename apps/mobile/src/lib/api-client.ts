import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import {
  ApiRequestDeps,
  ApiRequestOptions,
  apiRequestCore,
  normalizeApiBaseUrl,
} from './api-client-core';
import { getAppCheckToken } from './app-check-token';

export {
  ApiAuthError,
  ApiConflictError,
  ApiHttpError,
  ApiNetworkError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiTimeoutError,
  ApiValidationError,
} from './api-client-core';
export type { ApiRequestOptions } from './api-client-core';

/**
 * One typed fetch client for the domain REST API (`/api/profile`,
 * `/api/workouts`, ... — see packages/contract/src/api-contract.ts), mirroring the
 * BASE_URL/token pattern already used for `/api/ai` in src/lib/ai-client.ts.
 * Consumers (repositories/*.web.ts, native sync's remote adapters) call
 * `apiRequest`, never `fetch`/Firestore directly, so auth/error handling
 * stays in one place. Core request/error logic lives in api-client-core.ts.
 */
// A configured origin is required for native and deliberately honored on web
// too: Preview's static web host can be separate from the Vercel API origin.
// Only an absent value falls back to web's relative, same-origin `/api/*`.
const BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
const CLIENT_VERSION = Constants.expoConfig?.version ?? 'unknown';

/**
 * Dev-only request log. Production builds stay silent — `__DEV__` is inlined
 * by Metro, so the whole call is dropped from release bundles.
 *
 * Failures use console.warn so they surface in Metro without having to open
 * Settings -> Sync status, which is where a failed sync used to die quietly.
 */
const devLog: ApiRequestDeps['log'] = __DEV__
  ? ({ method, url, status, code, requestId, retried, durationMs, error, errorMessage }) => {
      const line = `[api] ${method} ${url} -> ${status ?? '(no response)'} ${durationMs}ms`;
      const diagnostics = [
        error,
        // Only ever printed here: this logger is __DEV__-gated and Metro-only,
        // so the message (which can quote response values) never ships.
        errorMessage,
        code ? `code=${code}` : undefined,
        requestId ? `requestId=${requestId}` : undefined,
        retried ? 'tokenRefreshed=true' : undefined,
      ]
        .filter(Boolean)
        .join(' ');
      if (diagnostics) console.warn(`${line} ${diagnostics}`);
      else console.log(line);
    }
  : undefined;

async function defaultGetIdToken(forceRefresh = false): Promise<string | null> {
  // Dynamically imported so a caller that only needs the error classes (or
  // tests api-client-core.ts directly) never triggers Firebase init.
  const { auth } = await import('@/config/firebase');
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}

export async function apiRequest<TOut = void>(
  path: string,
  options: ApiRequestOptions<TOut> = {}
): Promise<TOut> {
  if (!BASE_URL && Platform.OS !== 'web') {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not set, so there is no API to call. ' +
        'Set it in .env (local) and in the EAS environment for this build profile.'
    );
  }
  const deps: ApiRequestDeps = {
    baseUrl: BASE_URL,
    clientVersion: CLIENT_VERSION,
    fetchImpl: expoFetch as ApiRequestDeps['fetchImpl'],
    getIdToken: defaultGetIdToken,
    getAppCheckToken,
    log: devLog,
  };
  return apiRequestCore(path, deps, options);
}
