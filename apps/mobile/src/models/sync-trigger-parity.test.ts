import assert from 'node:assert/strict';
import { mock } from 'bun:test';

type UidState = { uid: string | null; currentUid: string | null };
type SyncCall = { uid: string; currentUid: string; options?: unknown };

const uidState: UidState = { uid: null, currentUid: null };
const syncCalls: SyncCall[] = [];
let syncFailure: Error | null = null;
let syncOutcome = { status: 'ok' as const, pushed: 0, pulled: 0, remoteDeletions: 0 };
const syncNow = async (uid: string, currentUid: string, options?: unknown) => {
  syncCalls.push({ uid, currentUid, options });
  if (syncFailure) throw syncFailure;
  return syncOutcome;
};
mock.module(new URL('./sync.ts', import.meta.url).pathname, () => ({ syncNow }));

let dataVersionBumps = 0;
mock.module(new URL('./data-version.ts', import.meta.url).pathname, () => ({
  bumpDataVersion: () => {
    dataVersionBumps += 1;
  },
}));

let appStateListener: ((state: string) => void) | null = null;
let appStateRemoved = 0;
let networkListener: ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | null = null;
let networkUnsubscribed = 0;
const reactNativeMock = () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: () => { appStateRemoved += 1; } };
    },
  },
  Platform: { OS: 'ios' },
});
mock.module('react-native', reactNativeMock);
mock.module('react-native-web', reactNativeMock);
mock.module(new URL('../../../../node_modules/react-native/index.js', import.meta.url).pathname, reactNativeMock);
const netInfoMock = () => ({
  default: {
    addEventListener: (listener: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) => {
      networkListener = listener;
      return () => { networkUnsubscribed += 1; };
    },
  },
});
mock.module('@react-native-community/netinfo', netInfoMock);
mock.module(new URL('../../../../node_modules/@react-native-community/netinfo/lib/commonjs/index.js', import.meta.url).pathname, netInfoMock);

let backgroundTaskName = '';
let backgroundTaskHandler: (() => Promise<string>) | null = null;
let backgroundRegistered = 0;
let backgroundUnregistered = 0;
const taskManagerMock = () => ({
  defineTask: (name: string, handler: () => Promise<string>) => {
    backgroundTaskName = name;
    backgroundTaskHandler = handler;
  },
});
mock.module('expo-task-manager', taskManagerMock);
mock.module(new URL('../../../../node_modules/expo-task-manager/build/TaskManager.js', import.meta.url).pathname, taskManagerMock);
const backgroundTaskMock = () => ({
  BackgroundTaskResult: { Success: 'success', Failed: 'failed' },
  registerTaskAsync: async () => { backgroundRegistered += 1; },
  unregisterTaskAsync: async () => { backgroundUnregistered += 1; },
});
mock.module('expo-background-task', backgroundTaskMock);
mock.module(new URL('../../../../node_modules/expo-background-task/build/BackgroundTask.js', import.meta.url).pathname, backgroundTaskMock);

// The mobile Bun preload maps `react-native` to a pre-created react-native-web
// object. Patch both that object and the direct mock so the native source file
// sees the deterministic lifecycle listeners below.
type ReactNativeSurface = {
  Platform?: { OS: string };
  AppState?: { addEventListener: (event: string, listener: (state: string) => void) => unknown };
};
// react-native-web is provided by the test preload but has no local type
// declaration; its runtime object is patched so native source sees iOS.
// @ts-expect-error react-native-web has no declaration in this project
const reactNativeModules: ReactNativeSurface[] = [await import('react-native'), await import('react-native-web')];
for (const module of reactNativeModules) {
  const platform = module.Platform;
  if (platform) platform.OS = 'ios';
  const appState = module.AppState;
  if (appState) appState.addEventListener = (_event: string, listener: (state: string) => void) => {
    appStateListener = listener;
    return { remove: () => { appStateRemoved += 1; } };
  };
}
type NetworkState = { isConnected: boolean | null; isInternetReachable: boolean | null };
const netInfoModule = await import('@react-native-community/netinfo') as { default?: { addEventListener: (listener: (state: NetworkState) => void) => () => void } };
if (netInfoModule.default) netInfoModule.default.addEventListener = (listener) => {
  networkListener = listener;
  return () => { networkUnsubscribed += 1; };
};

// Use explicit platform files so the web-first Bun preload resolver does not
// silently turn the native half of this contract into the web implementation.
const native = await import(new URL('./sync-trigger.ts', import.meta.url).pathname);

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// The native lifecycle is guarded by the active/current UID pair and starts
// one initial sync plus event-driven foreground/connectivity/background runs.
native.configureSyncTrigger(() => uidState);
native.startSyncTriggers();
await flush();
assert.equal(syncCalls.length, 0, 'native: signed-out start does not sync');
assert.equal(backgroundRegistered, 1, 'native: start registers background sync');
assert.equal(backgroundTaskName, 'pumppal-background-sync');
assert.ok(appStateListener);
assert.ok(networkListener);
assert.ok(backgroundTaskHandler);

uidState.uid = 'user-a';
uidState.currentUid = 'user-a';
native.stopSyncTriggers();
assert.equal(appStateRemoved, 1, 'native: stop removes the app-state listener');
assert.equal(networkUnsubscribed, 1, 'native: stop removes the network listener');
assert.equal(backgroundUnregistered, 1, 'native: stop unregisters background sync');

native.startSyncTriggers();
await flush();
assert.equal(syncCalls.length, 1, 'native: valid start runs initial sync');
native.startSyncTriggers();
await flush();
assert.equal(syncCalls.length, 1, 'native: repeated start is idempotent');

native.triggerSyncAfterWrite();
await flush();
assert.equal(syncCalls.length, 2, 'native: explicit write trigger syncs the active uid');

(appStateListener as ((state: string) => void) | null)!('background');
await flush();
assert.equal(syncCalls.length, 2, 'native: background app state does not trigger foreground sync');
(appStateListener as ((state: string) => void) | null)!('active');
await flush();
assert.equal(syncCalls.length, 3, 'native: active app state triggers sync');

(networkListener as ((state: NetworkState) => void) | null)!({ isConnected: true, isInternetReachable: true });
await flush();
assert.equal(syncCalls.length, 3, 'native: first connected event does not imply an offline transition');
(networkListener as ((state: NetworkState) => void) | null)!({ isConnected: false, isInternetReachable: false });
(networkListener as ((state: NetworkState) => void) | null)!({ isConnected: true, isInternetReachable: true });
await flush();
assert.equal(syncCalls.length, 4, 'native: offline-to-online transition triggers sync');
(networkListener as ((state: NetworkState) => void) | null)!({ isConnected: true, isInternetReachable: true });
await flush();
assert.equal(syncCalls.length, 4, 'native: repeated online events do not retrigger sync');

syncOutcome = { status: 'ok', pushed: 0, pulled: 1, remoteDeletions: 0 };
native.triggerSyncAfterWrite();
await flush();
assert.equal(dataVersionBumps, 1, 'native: pulled data announces a local data change');
syncOutcome = { status: 'ok', pushed: 0, pulled: 0, remoteDeletions: 0 };

uidState.currentUid = 'different-user';
native.triggerSyncAfterWrite();
await flush();
assert.equal(syncCalls.length, 5, 'native: mismatched current UID is refused');
uidState.currentUid = 'user-a';

syncFailure = new Error('offline');
native.triggerSyncAfterWrite();
await flush();
assert.equal(syncCalls.length, 6, 'native: sync failure remains contained to the fire-and-forget trigger');
syncFailure = null;

const initial = await native.waitForInitialSync('user-a');
assert.deepEqual(initial, { kind: 'success', uid: 'user-a' }, 'native: initial sync resolves success for the active UID');
const retry = await native.retryInitialSync('user-a');
assert.deepEqual(retry, { kind: 'success', uid: 'user-a' }, 'native: retry resolves success for the active UID');
await flush();
assert.equal(syncCalls.length, 7, 'native: retry starts one additional sync');

const backgroundResult = await (backgroundTaskHandler as (() => Promise<string>) | null)!();
assert.equal(backgroundResult, 'success', 'native: background task reports success');
const backgroundCall = syncCalls.at(-1);
assert.equal(backgroundCall?.uid, 'user-a', 'native: background task uses the active UID');
assert.equal(backgroundCall?.currentUid, 'user-a');
assert.equal((backgroundCall?.options as { maxOutboxItems?: number }).maxOutboxItems, 50, 'native: background task uses the bounded item budget');
assert.ok((backgroundCall?.options as { signal?: unknown }).signal instanceof AbortSignal, 'native: background task passes an abort signal');

native.stopSyncTriggers();
assert.equal(appStateRemoved, 2, 'native: stop remains safe after a running lifecycle');
assert.equal(networkUnsubscribed, 2);
assert.equal(backgroundUnregistered, 2);
assert.deepEqual(await native.waitForInitialSync('user-a'), { kind: 'auth-transition', uid: 'user-a' }, 'native: stopped lifecycle has no initial result');

const web = await import(new URL('./sync-trigger.web.ts', import.meta.url).pathname);
const webProvider = () => ({ uid: 'web-user', currentUid: 'web-user' });
web.configureSyncTrigger(webProvider);
web.startSyncTriggers();
web.triggerSyncAfterWrite();
web.stopSyncTriggers();
assert.deepEqual(await web.waitForInitialSync('web-user'), { kind: 'success', uid: 'web-user' }, 'web: reads are immediately ready');
assert.deepEqual(await web.retryInitialSync('web-user'), { kind: 'success', uid: 'web-user' }, 'web: retry is an immediate success');
assert.equal(syncCalls.length, 8, 'web: no-op lifecycle never calls native sync');

console.log('sync-trigger parity: all assertions passed');
