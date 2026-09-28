import assert from 'node:assert/strict';
import { mock, test } from 'bun:test';
import type { ActiveSession } from './active-workout-session';

let ready!: () => void;
const authentication = new Promise<void>(resolve => { ready = resolve; });
let uid: string | null = 'u1';
let journal: object[] = [];
const acknowledged: string[][] = [];
const calls: string[] = [];
let failSave = false;
let session: ActiveSession | null = {
  id: 's1', uid: 'u1', planId: null, name: 'Push', startedAt: new Date().toISOString(), cameFromPlan: false,
  rows: [],
};
mock.module('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth: {
  authStateReady: () => authentication,
  get currentUser() { return uid ? { uid } : null; },
} }));
mock.module(new URL('../data/sync-trigger.web.ts', import.meta.url).pathname, () => ({ configureSyncTrigger: () => {} }));
mock.module(new URL('../../modules/live-update-notification/index.ts', import.meta.url).pathname, () => ({
  readJournal: () => JSON.stringify(journal),
  acknowledgeJournal: async (ids: string[]) => {
    calls.push('ack');
    acknowledged.push(ids);
    journal = journal.filter(entry => !ids.includes((entry as { id: string }).id));
    return true;
  },
  subscribeJournal: () => () => {},
}));
mock.module(new URL('./active-workout-session.ts', import.meta.url).pathname, () => ({
  loadSession: async () => session,
  getSession: () => session,
  flushSessionPersistence: async () => { calls.push('persist'); },
}));
mock.module(new URL('./finish-active-workout.ts', import.meta.url).pathname, () => ({
  finishActiveWorkout: async (_uid: string, _snapshot: ActiveSession, durable: boolean, finishedAt: number) => {
    if (failSave) throw new Error('save failed');
    calls.push(`finish:${durable}:${finishedAt}`);
    session = null;
    return true;
  },
  isFinishingWorkout: () => false,
}));
mock.module(new URL('./workout-notification.ios.ts', import.meta.url).pathname, () => ({
  dismissWorkoutNotification: async () => { calls.push('dismiss'); },
}));
mock.module(new URL('./workout-surface-sync.ts', import.meta.url).pathname, () => ({
  flushWorkoutNotification: async () => { calls.push('publish'); },
}));
mock.module(new URL('./wear-action-task.ts', import.meta.url).pathname, () => ({
  handleWorkoutAction: async (action: { id: string; action: string }, durable: boolean) => {
    calls.push(`${action.action}:${action.id}:${durable}`);
  },
}));
const { reconcileIosWorkoutActions } = await import('./live-activity-runtime.ios');

const entry = (id: string, action: string, workoutId = 's1', expectedCompletedSets = 0) =>
  ({ id, action, workoutId, expectedCompletedSets, atMs: 5_000 });

test('replays native taps in order after auth, acknowledging only once the draft is durable', async () => {
  await reconcileIosWorkoutActions(); // Empty journal: no auth wait, no work.
  journal = [entry('a', 'completeSet'), entry('b', 'uncompleteSet', 's1', 1), { id: 'junk' }, entry('c', 'completeSet', 'old')];
  const running = reconcileIosWorkoutActions();
  await Promise.resolve();
  assert.deepEqual(calls, [], 'must wait for Firebase auth before touching the draft');
  ready();
  await running;
  assert.deepEqual(calls, ['completeSet:a:true', 'uncompleteSet:b:true', 'persist', 'ack', 'publish']);
  assert.deepEqual(acknowledged, [['a', 'b', 'junk', 'c']], 'invalid and other-session entries are dropped');
});

test('another account never applies taps', async () => {
  calls.length = 0;
  uid = 'someone-else';
  journal = [entry('d', 'completeSet')];
  await reconcileIosWorkoutActions();
  assert.deepEqual(calls, ['persist', 'ack', 'publish']);
  uid = 'u1';
});

test('a queued Finish saves with the tap time; a failed save keeps the journal for retry', async () => {
  calls.length = 0;
  failSave = true;
  journal = [entry('f', 'finishWorkout', 's1', 1)];
  await assert.rejects(reconcileIosWorkoutActions());
  assert.equal(journal.length, 1);
  failSave = false;
  calls.length = 0;
  await reconcileIosWorkoutActions();
  assert.deepEqual(calls, ['finish:true:5000', 'persist', 'ack', 'dismiss']);
  assert.equal(journal.length, 0);
});
