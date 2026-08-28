import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mock } from 'bun:test';
import { openTestDb } from './test-executor';
import { runMigrations } from './migrate';
import { enqueue } from './outbox';
import { purgeUid } from './purge';

const native = openTestDb();
await runMigrations(native.db);

mock.module(new URL('./client.ts', import.meta.url).pathname, () => ({
  getDb: async () => native.db,
  purgeUidData: async (uid: string) => purgeUid(native.db, uid),
}));

const syncCalls: { uid: string; currentUid: string }[] = [];
let syncFailure: Error | null = null;
mock.module(new URL('./sync.ts', import.meta.url).pathname, () => ({
  syncNow: async (uid: string, currentUid: string) => {
    syncCalls.push({ uid, currentUid });
    if (syncFailure) throw syncFailure;
    return { status: 'ok', pushed: 0, pulled: 0, remoteDeletions: 0 };
  },
}));

let invalidateCalls = 0;
let invalidateFailure: Error | null = null;
mock.module(new URL('./web-direct-firestore.ts', import.meta.url).pathname, () => ({
  invalidateWebReads: () => {
    invalidateCalls += 1;
    if (invalidateFailure) throw invalidateFailure;
  },
}));

const { countPendingSync, syncBeforeSignOut, purgeLocalAccountData: purgeNative } = await import('./account-data');
const { countPendingSync: countWeb, syncBeforeSignOut: syncWeb, purgeLocalAccountData: purgeWeb } = await import('./account-data.web');

async function seedPending(uid: string, entityId: string): Promise<void> {
  await enqueue(native.db, {
    uid,
    entityType: 'workout',
    entityId,
    op: 'update',
    payload: { id: entityId },
    baseVersion: 'v1',
  });
}

async function seedProfile(uid: string): Promise<void> {
  await native.db.runAsync(
    `INSERT INTO profile (uid, data, sync_state, server_version, updated_at, deleted)
     VALUES (?, ?, 'synced', NULL, ?, 0)`,
    [uid, JSON.stringify({}), '2026-08-27T00:00:00.000Z'],
  );
}

// Native countPendingSync counts only this UID's outbox intents and treats a
// missing account as an ordinary zero-count state.
await seedPending('native-user-a', 'workout-a');
await seedPending('native-user-b', 'workout-b');
assert.equal(await countPendingSync('native-user-a'), 1, 'native: pending count is uid-scoped');
assert.equal(await countPendingSync('native-user-b'), 1, 'native: second uid has its own pending count');
assert.equal(await countPendingSync('native-missing'), 0, 'native: missing uid has no pending work');

await syncBeforeSignOut('native-user-a');
assert.deepEqual(syncCalls, [{ uid: 'native-user-a', currentUid: 'native-user-a' }], 'native: sign-out sync uses the active uid');
syncFailure = new Error('offline');
await assert.doesNotReject(() => syncBeforeSignOut('native-user-a'), 'native: final sync failure is best-effort');
syncFailure = null;

await seedProfile('native-user-a');
await seedProfile('native-user-b');
await AsyncStorage.setItem('cache_native-user-a', 'remove');
await AsyncStorage.setItem('cache_native-user-b', 'keep');
await AsyncStorage.setItem('pumppal_up_next_widget_v1', 'remove shared projection');
await AsyncStorage.setItem('unrelated-cache', 'keep');
await purgeNative('native-user-a');
assert.equal(await countPendingSync('native-user-a'), 0, 'native: purge removes the uid outbox');
assert.equal(await native.db.getFirstAsync('SELECT uid FROM profile WHERE uid = ?', ['native-user-a']), null, 'native: purge removes the uid profile');
assert.equal(await countPendingSync('native-user-b'), 1, 'native: purge preserves another uid outbox');
assert.ok(await native.db.getFirstAsync('SELECT uid FROM profile WHERE uid = ?', ['native-user-b']), 'native: purge preserves another uid profile');
const remainingKeys = await AsyncStorage.getAllKeys();
assert.ok(!remainingKeys.includes('cache_native-user-a'), 'native: purge removes uid cache keys');
assert.ok(!remainingKeys.includes('pumppal_up_next_widget_v1'), 'native: purge removes shared projection keys');
assert.ok(remainingKeys.includes('cache_native-user-b'), 'native: purge preserves another uid cache keys');
assert.ok(remainingKeys.includes('unrelated-cache'), 'native: purge preserves unrelated cache keys');

// Web is online/API-backed: there is no local outbox or local collection, so
// count and final-sync are stable no-ops for every UID. Its purge invalidates
// the process-wide read cache; the seam is mocked because the implementation
// intentionally performs no fetch during sign-out.
assert.equal(await countWeb('web-user-a'), 0, 'web: pending count is zero');
assert.equal(await countWeb('web-user-b'), 0, 'web: pending count is uid-independent');
await syncWeb('web-user-a');
assert.equal(syncCalls.length, 2, 'web: sign-out sync does not call native sync');
await purgeWeb('web-user-a');
await purgeWeb('web-user-b');
assert.equal(invalidateCalls, 2, 'web: purge invalidates the global read cache for each sign-out');

invalidateFailure = new Error('cache unavailable');
await assert.rejects(() => purgeWeb('web-user-a'), /cache unavailable/, 'web: cache invalidation failures propagate');
invalidateFailure = null;

native.raw.close();
console.log('account-data parity: all assertions passed');
