import assert from 'node:assert/strict';
import { setAppCheckTokenProvider } from './app-check-token';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

let currentUser: { uid: string; getIdToken: () => Promise<string> } | null = null;
let netInfo = { isConnected: true, isInternetReachable: true };
const events: string[] = [];

// Keep this module instance independent from the configured-base client test.
// Bun's runtime module cache treats query imports as the same source module.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'ai-client-base-url-test-doubles',
  setup(build: Build) {
    build.module('@/config/firebase', () => ({
      exports: { auth: { get currentUser() { return currentUser; } } },
      loader: 'object',
    }));
    build.module('@react-native-community/netinfo', () => ({
      exports: { default: { fetch: async () => { events.push('connectivity'); return netInfo; } } },
      loader: 'object',
    }));
    build.module('react-native', () => ({
      exports: { Platform: { OS: 'ios' } },
      loader: 'object',
    }));
    build.module('expo/fetch', () => ({
      exports: { fetch: async () => { events.push('fetch'); throw new Error('fetch should not run'); } },
      loader: 'object',
    }));
    build.module('@/lib/ai-quota-cache', () => ({
      exports: { recordRemaining: () => {} },
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
    data: { aiEnabled: true },
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-08-27T00:00:00.000Z',
    deleted: false,
  };
};

setAppCheckTokenProvider(async () => {
  events.push('app-check');
  return 'app-check-token';
});

delete process.env.EXPO_PUBLIC_API_BASE_URL;
const client = await import('./ai-client');
currentUser = { uid: 'user-1', getIdToken: async () => 'id-token' };

await assert.rejects(
  () => client.callAI('daily-name'),
  (error: unknown) => {
    assert.match(String(error), /EXPO_PUBLIC_API_BASE_URL is not set/);
    return true;
  },
);
assert.deepEqual(events, ['ai-enabled', 'connectivity']);

profileRepository.get = originalProfileGet;
setAppCheckTokenProvider(undefined);

console.log('ai-client base URL: all assertions passed');
