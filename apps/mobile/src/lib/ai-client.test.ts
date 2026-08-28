import assert from 'node:assert/strict';
import { initialSyncOutcomeFromError } from '@/data/initial-sync';
import { setAppCheckTokenProvider } from './app-check-token';

type TestUser = {
  uid: string;
  getIdToken: () => Promise<string>;
};

type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

let currentUser: TestUser | null = null;
let aiEnabled = false;
let netInfo: NetInfoState = { isConnected: true, isInternetReachable: true };
let appCheckToken: string | null = null;
let fetchImpl: (url: string, init: Record<string, unknown>) => Promise<unknown> = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { name: 'Daily name' }, remaining: 4 }),
});
const events: string[] = [];
const fetchCalls: { url: string; init: Record<string, unknown> }[] = [];

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The mobile preload supplies package doubles of its own. Register these
// request-specific seams again so this client test controls every guard while
// remaining independent of other top-level assertion scripts.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'ai-client-test-doubles',
  setup(build: Build) {
    build.module('@/config/firebase', () => ({
      exports: { auth: { get currentUser() { return currentUser; } } },
      loader: 'object',
    }));
    build.module('@react-native-community/netinfo', () => ({
      exports: {
        default: { fetch: async () => { events.push('connectivity'); return netInfo; } },
      },
      loader: 'object',
    }));
    build.module('react-native', () => ({
      exports: { Platform: { OS: 'ios' } },
      loader: 'object',
    }));
    build.module('@/lib/ai-quota-cache', () => ({
      exports: { recordRemaining: () => {} },
      loader: 'object',
    }));
    build.module('expo/fetch', () => ({
      exports: {
        fetch: async (url: string, init: Record<string, unknown>) => {
          events.push('fetch');
          fetchCalls.push({ url, init });
          return fetchImpl(url, init);
        },
      },
      loader: 'object',
    }));
  },
});

const { profileRepository } = await import('@/data/profile-repository');
const originalProfileGet = profileRepository.get;
profileRepository.get = async () => {
  events.push('ai-enabled');
  return {
    id: 'profile',
    data: { aiEnabled },
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-08-27T00:00:00.000Z',
    deleted: false,
  };
};
setAppCheckTokenProvider(async () => {
  events.push('app-check');
  return appCheckToken;
});

async function importConfiguredClient() {
  const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://ai-client.test///';
  try {
    return await import('./ai-client');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previous;
  }
}

const client = await importConfiguredClient();

// No signed-in user is rejected before the opt-in, connectivity, App Check,
// or fetch seams are touched.
events.length = 0;
fetchCalls.length = 0;
currentUser = null;
const signedOutError = await client.callAI('daily-name').catch((error: unknown) => error);
assert.equal((signedOutError as Error).message, 'You must be signed in to use AI features.');
assert.deepEqual(events, []);
assert.equal(fetchCalls.length, 0);

currentUser = { uid: 'user-1', getIdToken: async () => 'id-token' };

// Opt-out is the second guard and fails before connectivity or any request.
events.length = 0;
aiEnabled = false;
const disabledError = await client.callAI('daily-name').catch((error: unknown) => error);
assert.ok(disabledError instanceof client.AIDisabledError);
assert.deepEqual(events, ['ai-enabled']);
assert.equal(fetchCalls.length, 0);

// Once enabled, native connectivity is checked before the base URL and
// request guards.
events.length = 0;
aiEnabled = true;
netInfo = { isConnected: false, isInternetReachable: true };
const offlineError = await client.callAI('daily-name').catch((error: unknown) => error);
assert.ok(offlineError instanceof client.AIOfflineError);
assert.deepEqual(events, ['ai-enabled', 'connectivity']);
assert.equal(fetchCalls.length, 0);

// The remaining guards run in order: App Check, token construction, then
// fetch. The response is returned to the caller and carries its quota value.
netInfo = { isConnected: true, isInternetReachable: true };
events.length = 0;
fetchCalls.length = 0;
appCheckToken = 'app-check-token';
fetchImpl = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { name: 'Daily name' }, remaining: 4 }),
});
const response = await client.callAI('daily-name');
assert.deepEqual(response.data, { name: 'Daily name' });
assert.deepEqual(events, ['ai-enabled', 'connectivity', 'app-check', 'fetch']);
assert.equal(fetchCalls[0]?.url, 'https://ai-client.test/api/ai');
assert.deepEqual(fetchCalls[0]?.init.headers, {
  'Content-Type': 'application/json',
  Authorization: 'Bearer id-token',
  'X-Firebase-AppCheck': 'app-check-token',
});

// Transport failures preserve the URL and the `reach` token consumed by
// initial-sync's offline classifier.
fetchImpl = async () => { throw new Error('socket closed'); };
const networkFailure = await client.callAI('daily-name').catch((error: unknown) => error);
assert.equal(
  (networkFailure as Error).message,
  'Could not reach https://ai-client.test/api/ai: socket closed',
);
assert.deepEqual(initialSyncOutcomeFromError('user-1', networkFailure), {
  kind: 'offline',
  uid: 'user-1',
  message: 'Network error. Check your connection and try again.',
});
profileRepository.get = originalProfileGet;
setAppCheckTokenProvider(undefined);

console.log('ai-client: all assertions passed');
