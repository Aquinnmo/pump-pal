import assert from 'node:assert/strict';
import { mock } from 'bun:test';

const createMock = mock as unknown as <T extends (...args: any[]) => any>(implementation: T) => T;

type RemoteRecord = { version: string; data: { id?: string; uid?: string; kind?: string } };
const listCalls: { uid: string; kind: string }[] = [];
const profileCalls: string[] = [];
const pushupCalls: string[] = [];
const clients: unknown[] = [];
const catalogClients: unknown[] = [];
const failedOnce = new Set<string>();

mock.module(new URL('./firestore-sync-remote.ts', import.meta.url).pathname, () => ({
  createFirestoreSyncRemote: (client: unknown, uid: string) => {
    clients.push({ client, uid });
    return {
      workouts: {
        list: async () => {
          listCalls.push({ uid, kind: 'workout' });
          const key = `workout:${uid}`;
          if (uid === 'offline-user' && !failedOnce.has(key)) {
            failedOnce.add(key);
            throw new Error('offline');
          }
          return [{ version: `workout-version-${uid}`, data: { id: `workout-${uid}`, uid, kind: 'workout' } }] satisfies RemoteRecord[];
        },
      },
      injuries: {
        list: async () => {
          listCalls.push({ uid, kind: 'injury' });
          return [{ version: `injury-version-${uid}`, data: { id: `injury-${uid}`, uid, kind: 'injury' } }] satisfies RemoteRecord[];
        },
      },
      profile: {
        get: async () => {
          profileCalls.push(uid);
          return { version: `profile-version-${uid}`, data: { uid, kind: 'profile' } };
        },
      },
      pushup: {
        read: async () => {
          pushupCalls.push(uid);
          return { version: `pushup-version-${uid}`, data: { uid, kind: 'pushup' } };
        },
      },
      remote: {},
    };
  },
  getApprovedCatalogSnapshot: async (client: unknown) => {
    catalogClients.push(client);
    return { exercises: [], version: 'catalog-version' };
  },
}));

mock.module(new URL('../lib/firestore-rest-client.ts', import.meta.url).pathname, () => ({
  firestoreRestClient: createMock(() => ({ kind: 'rest-client' })),
}));

const {
  getWebCatalog,
  invalidateWebReads,
  listWebEntities,
  listWebInjuryRecords,
  readWebProfile,
  readWebPushup,
  webFirestore,
} = await import('./web-direct-firestore');

const firstWorkout = await listWebEntities('uid-a', 'workout');
assert.deepEqual(firstWorkout, [{ id: 'workout-uid-a', uid: 'uid-a', kind: 'workout' }]);
assert.deepEqual(await listWebEntities('uid-a', 'workout'), firstWorkout, 'same uid/kind reads share one cached request');
assert.equal(listCalls.filter((call) => call.uid === 'uid-a' && call.kind === 'workout').length, 1);

await listWebEntities('uid-a', 'injury');
await listWebInjuryRecords('uid-a');
assert.equal(listCalls.filter((call) => call.uid === 'uid-a' && call.kind === 'injury').length, 1, 'injury entity and record callers share the same cache key');
await listWebEntities('uid-b', 'workout');
assert.equal(listCalls.filter((call) => call.kind === 'workout').length, 2, 'uid-scoped keys never leak one account into another');

assert.equal((await readWebProfile('uid-a'))?.version, 'profile-version-uid-a');
await readWebProfile('uid-a');
assert.equal(profileCalls.filter((uid) => uid === 'uid-a').length, 1);
assert.equal((await readWebPushup('uid-a')).version, 'pushup-version-uid-a');
await readWebPushup('uid-a');
assert.equal(pushupCalls.filter((uid) => uid === 'uid-a').length, 1);

const catalog = await getWebCatalog();
assert.deepEqual(catalog, { exercises: [], version: 'catalog-version' });
assert.equal(catalogClients.length, 1, 'catalog reads use the direct REST client seam');
assert.equal(clients.length >= 1, true, 'webFirestore creates a uid-scoped direct remote');
webFirestore('uid-c');
assert.equal((clients.at(-1) as { uid: string }).uid, 'uid-c', 'webFirestore forwards the requested uid');

invalidateWebReads();
await listWebEntities('uid-a', 'workout');
assert.equal(listCalls.filter((call) => call.uid === 'uid-a' && call.kind === 'workout').length, 2, 'writes invalidate every cached web read');

await assert.rejects(() => listWebEntities('offline-user', 'workout'), /offline/);
assert.deepEqual(
  await listWebEntities('offline-user', 'workout'),
  [{ id: 'workout-offline-user', uid: 'offline-user', kind: 'workout' }],
  'a rejected read is not retained as a permanent session error'
);

console.log('src/data/web-direct-firestore.test.ts: all assertions passed');
