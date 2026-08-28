import assert from 'node:assert/strict';
import { mock } from 'bun:test';

class TestSyncAuthError extends Error {}
class TestSyncConflictError extends Error {}
class TestSyncRateLimitError extends Error {}
class TestApiAuthError extends Error {}
class TestApiConflictError extends Error {}
class TestApiRateLimitError extends Error {}

let runSyncCalls = 0;
let capturedAdapters: { entityType: string; remote: { create: (payload: unknown, id: string) => Promise<unknown> } }[] = [];

mock.module(new URL('./sync-engine.ts', import.meta.url).pathname, () => ({
  SyncAuthError: TestSyncAuthError,
  SyncConflictError: TestSyncConflictError,
  SyncRateLimitError: TestSyncRateLimitError,
  runSync: async (...args: any[]) => {
    runSyncCalls += 1;
    capturedAdapters = args[2];
    const catalog = capturedAdapters.find((adapter) => adapter.entityType === 'catalog_exercise');
    await catalog?.remote.create({ name: 'New exercise' }, 'pending-id');
    return { status: 'ok', pushed: 1, pulled: 0, remoteDeletions: 0 };
  },
}));
mock.module(new URL('./client.ts', import.meta.url).pathname, () => ({ getDb: async () => ({ kind: 'test-db' }) }));
mock.module(new URL('./keyed-mutex.ts', import.meta.url).pathname, () => ({
  createKeyedMutex: () => ({ run: (_key: string, task: () => Promise<unknown>) => task() }),
}));
mock.module(new URL('./workouts.ts', import.meta.url).pathname, () => ({ getAll: async () => [], update: async () => undefined, removeClean: async () => undefined }));
mock.module(new URL('./injuries.ts', import.meta.url).pathname, () => ({ getAll: async () => [], update: async () => undefined, removeClean: async () => undefined }));
mock.module(new URL('./catalog.ts', import.meta.url).pathname, () => ({ markSynced: async () => undefined }));
mock.module(new URL('./singleton-repository.ts', import.meta.url).pathname, () => ({
  getSingleton: async () => null,
  upsertSingleton: async () => undefined,
  removeCleanSingleton: async () => undefined,
}));
mock.module(new URL('./firestore-sync-remote.ts', import.meta.url).pathname, () => ({
  createFirestoreSyncRemote: () => ({ remote: {}, workouts: {}, injuries: {}, profile: {}, pushup: {} }),
}));
mock.module(new URL('./remote/catalog.ts', import.meta.url).pathname, () => ({
  createPendingExercise: async () => { throw new TestApiAuthError('token expired'); },
}));
mock.module(new URL('../lib/firestore-rest-client.ts', import.meta.url).pathname, () => ({ firestoreRestClient: () => ({}) }));
mock.module(new URL('../lib/api-client.ts', import.meta.url).pathname, () => ({
  ApiAuthError: TestApiAuthError,
  ApiConflictError: TestApiConflictError,
  ApiRateLimitError: TestApiRateLimitError,
}));

const { syncNow } = await import('./sync');

assert.deepEqual(await syncNow('uid-a', null), { status: 'auth-required' }, 'signed-out callers cannot start a sync');
assert.deepEqual(await syncNow('uid-a', 'uid-b'), { status: 'auth-required' }, 'a different current account cannot start this uid sync');
assert.equal(runSyncCalls, 0, 'the auth guard runs before database or adapter construction');

await assert.rejects(
  () => syncNow('uid-a', 'uid-a'),
  (error: unknown) => error instanceof TestSyncAuthError && error.message === 'token expired',
  'API auth errors from an adapter are translated to the sync engine error type'
);
assert.equal(runSyncCalls, 1);
assert.deepEqual(capturedAdapters.map((adapter) => adapter.entityType), [
  'workout', 'injury', 'profile', 'pushup_challenge', 'catalog_exercise',
], 'the wiring exposes every supported sync adapter at the stable engine seam');

console.log('src/data/sync.test.ts: all assertions passed');
