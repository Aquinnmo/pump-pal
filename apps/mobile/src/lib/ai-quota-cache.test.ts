import assert from 'node:assert/strict';

// AsyncStorage is a native module; the cache's persistence is best-effort and
// deliberately swallows its own errors, so an in-memory double is enough to
// exercise the guards that matter — which value is served, and when it isn't.
const store = new Map<string, string>();
const mockModule = {
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
};
// @ts-expect-error — bun's module registry, not a typed API.
await import('bun').then(({ plugin }) =>
  plugin({
    name: 'async-storage-stub',
    setup(build: { module: (s: string, cb: () => unknown) => void }) {
      build.module('@react-native-async-storage/async-storage', () => ({
        exports: mockModule,
        loader: 'object',
      }));
    },
  })
);

const { clearAIQuotaCache, getCachedRemaining, hydrateAIQuota, recordRemaining, subscribeAIQuota } =
  await import('./ai-quota-cache');

const UID = 'user-1';
const today = new Date().toISOString().slice(0, 10);
const STORAGE_KEY = 'pumppal_ai_quota_v1';

// Nothing cached yet: "not known", never a guessed full quota. The UI must show
// no number rather than invent one from a bundled limit.
assert.equal(getCachedRemaining(UID), null);
assert.equal(getCachedRemaining(undefined), null);

// A recorded value is served back, and notifies subscribers so a count on one
// screen updates when another screen spends a credit.
let notified = 0;
const unsubscribe = subscribeAIQuota(() => {
  notified += 1;
});
recordRemaining(UID, 6);
assert.equal(getCachedRemaining(UID), 6);
assert.equal(notified, 1);

// Zero is a real value, not "unknown" — 429 records it and the button must stay off.
recordRemaining(UID, 0);
assert.equal(getCachedRemaining(UID), 0);

// Another user's balance is never served for this one.
assert.equal(getCachedRemaining('user-2'), null);

unsubscribe();
recordRemaining(UID, 4);
assert.equal(notified, 2, 'unsubscribe stops notifications');

// Persisted under the shared key, with the day it belongs to.
assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)!), { uid: UID, date: today, remaining: 4 });

// Sign-out drops it: the next account must not inherit a balance.
clearAIQuotaCache();
assert.equal(getCachedRemaining(UID), null);
assert.equal(store.get(STORAGE_KEY), undefined);

// Hydration accepts today's record for the same user.
store.set(STORAGE_KEY, JSON.stringify({ uid: UID, date: today, remaining: 3 }));
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), 3);

// Hydration never clobbers a value already in memory — the disk read can land
// after a fresher server answer.
store.set(STORAGE_KEY, JSON.stringify({ uid: UID, date: today, remaining: 9 }));
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), 3, 'in-memory value wins over a slower disk read');

// A record from a previous UTC day is stale: the server has already rolled the
// quota over, so this must read as unknown rather than as yesterday's leftovers.
clearAIQuotaCache();
store.set(STORAGE_KEY, JSON.stringify({ uid: UID, date: '2020-01-01', remaining: 1 }));
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), null);

// Wrong user, and malformed records, are the same as no cache.
clearAIQuotaCache();
store.set(STORAGE_KEY, JSON.stringify({ uid: 'someone-else', date: today, remaining: 5 }));
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), null);

clearAIQuotaCache();
store.set(STORAGE_KEY, '{not json');
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), null);

clearAIQuotaCache();
store.set(STORAGE_KEY, JSON.stringify({ uid: UID, date: today, remaining: 'lots' }));
await hydrateAIQuota(UID);
assert.equal(getCachedRemaining(UID), null);

console.log('ai-quota-cache: all assertions passed');
