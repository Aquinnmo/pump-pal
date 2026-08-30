import assert from 'node:assert/strict';
import type { DraftExerciseRow } from '@/types/workout';
import { applyWearAction } from '@/lib/wear-state';

// AsyncStorage is a native module; loadSession()'s restore/expiry paths need a
// real-ish backing store to exercise, so an in-memory double stands in — and
// stays a plain module-scope Map (not React state) so it also plays the part of
// "disk" surviving the module resets below.
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

const STORAGE_KEY = 'pumppal_active_session_v1';

const { endSession, getSession, startSession, subscribe, updateSession, loadSession } =
  await import('./active-workout-session');

// A query-string-suffixed specifier gets its own entry in Bun's module cache, so
// importing it evaluates a fresh module instance — the only way to simulate a
// process restart (a blank `session` variable) within a single test file. TS
// can't resolve a dynamic specifier statically, so it's built from a variable
// rather than a literal.
type SessionModule = typeof import('./active-workout-session');
function reimport(tag: string): Promise<SessionModule> {
  const specifier = `./active-workout-session?case=${tag}`;
  return import(specifier) as Promise<SessionModule>;
}

function row(): DraftExerciseRow {
  return {
    uid: 'row-1',
    exerciseId: 'ex-1',
    variationId: null,
    label: 'Bench Press',
    exerciseType: 'Sets of Reps',
    bodyweight: false,
    sets: [{ reps: 5, weight: '135', durationMinutes: 0, durationSeconds: 30, completed: false }],
  };
}

async function main() {
  assert.equal(getSession(), null, 'no session before start');

  const started = startSession({ uid: 'u1', planId: null, name: 'Push Day', rows: [row()], cameFromPlan: false });
  assert.equal(getSession(), started);
  assert.equal(getSession()?.rows[0].sets[0].completed, false);

  // A live session always beats disk: loadSession() on the same module instance
  // is a no-op, not a resync from whatever was last written.
  assert.equal(await loadSession(), started, 'loadSession is a no-op with a session already in memory');

  let notifications = 0;
  const unsubscribe = subscribe(() => notifications++);

  const next = applyWearAction(started.rows, { action: 'completeSet', workoutId: started.id });
  updateSession(next);

  assert.equal(getSession()?.rows[0].sets[0].completed, true, 'completeSet action landed in the session');
  assert.equal(notifications, 1, 'subscriber was notified of the update');

  unsubscribe();

  // startSession/updateSession write through fire-and-forget (no debounce — see
  // the ponytail comment in active-workout-session.ts) — give the write a turn
  // to land in the stub store before simulating a restart off of it.
  await Promise.resolve();

  // 1. A fresh module instance (simulating a process restart) has no in-memory
  // session, so loadSession() must read the same rows and id back off disk.
  const restarted = await reimport('restart');
  assert.equal(restarted.getSession(), null, 'a fresh module instance starts with no in-memory session');
  const restored = await restarted.loadSession();
  assert.equal(restored?.id, started.id, 'restored session keeps the same id');
  assert.deepEqual(restored?.rows, next, 'restored session keeps the same rows');

  endSession();
  assert.equal(getSession(), null, 'session cleared after endSession');
  await Promise.resolve();

  // 2. endSession clears the storage key, so a later restart finds nothing.
  assert.equal(store.has(STORAGE_KEY), false, 'endSession clears the storage key');
  const afterEnd = await reimport('after-end');
  assert.equal(await afterEnd.loadSession(), null, 'loadSession returns null once the key is cleared');

  // A further mutation after the session ended is a no-op — nothing to resurrect.
  updateSession([row()]);
  assert.equal(getSession(), null, 'updateSession after endSession stays a no-op');

  // 3. A restored session older than the 24h window (see the ponytail comment in
  // active-workout-session.ts) is a forgotten workout, not a live one — dropped,
  // and swept off disk so it can't be found again either.
  store.set(
    STORAGE_KEY,
    JSON.stringify({
      id: 'stale-session',
      uid: 'u1',
      planId: null,
      name: 'Old Workout',
      startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      rows: [row()],
      cameFromPlan: false,
    }),
  );
  const stale = await reimport('stale');
  assert.equal(await stale.loadSession(), null, 'a 25h-old stored session is dropped');
  assert.equal(store.has(STORAGE_KEY), false, 'the stale key is cleared');

  console.log('src/lib/active-workout-session.test.ts: all assertions passed');
}

await main();
