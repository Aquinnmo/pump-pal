import assert from 'node:assert/strict';
import { mock, test } from 'bun:test';
import type { ActiveSession } from './active-workout-session';
import type { LiveUpdateNotificationAction } from './workout-action';

let ready!: () => void;
const authentication = new Promise<void>(resolve => { ready = resolve; });
let uid: string | null = 'u1';
let restores = 0;
let saves = 0;
const mutations: unknown[] = [];
let session: ActiveSession | null = {
  id: 's1', uid: 'u1', planId: null, name: 'Push', startedAt: new Date().toISOString(), cameFromPlan: false,
  rows: [{ uid: 'row', exerciseId: 'bench', variationId: null, label: 'Bench', exerciseType: 'Sets of Reps', bodyweight: false,
    sets: [{ reps: 8, weight: '135', durationMinutes: 0, durationSeconds: 0, completed: false }] }],
};
let backgroundHandler: ((action: LiveUpdateNotificationAction) => unknown) | undefined;
mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth: {
  authStateReady: () => authentication,
  get currentUser() { return uid ? { uid } : null; },
} }));
mock.module(new URL('../data/sync-trigger.web.ts', import.meta.url).pathname, () => ({ configureSyncTrigger: () => {} }));
mock.module(new URL('./active-workout-session.ts', import.meta.url).pathname, () => ({
  loadSession: async () => { restores++; return session; },
}));
mock.module(new URL('./finish-active-workout.ts', import.meta.url).pathname, () => ({
  finishActiveWorkout: async () => { saves++; return true; },
  isFinishingWorkout: () => false,
}));
mock.module(new URL('./live-update-notification-actions.ios.ts', import.meta.url).pathname, () => ({
  subscribeLiveUpdateNotificationActions: (handler: typeof backgroundHandler) => { backgroundHandler = handler; },
}));
mock.module(new URL('./workout-notification.ios.ts', import.meta.url).pathname, () => ({ dismissWorkoutNotification: async () => {} }));
mock.module(new URL('./workout-surface-sync.ts', import.meta.url).pathname, () => ({}));
mock.module(new URL('./wear-action-task.ts', import.meta.url).pathname, () => ({
  handleWorkoutAction: async (action: unknown, durable: boolean) => { mutations.push([action, durable]); },
}));
const { processIosWorkoutAction } = await import('./live-activity-runtime.ios');

test('cold intent waits for auth, restores its draft without a screen, rejects stale/account taps, and finishes in background', async () => {
  const complete: LiveUpdateNotificationAction = { action: 'completeSet', workoutId: 's1', expectedCompletedSets: 0 };
  const processing = backgroundHandler!(complete);
  assert.equal(restores, 0);
  ready();
  assert.equal(await processing, true);
  assert.deepEqual(mutations, [[complete, true]]);
  assert.equal(await processIosWorkoutAction({ ...complete, expectedCompletedSets: 1 }), false);
  uid = 'another-user';
  assert.equal(await processIosWorkoutAction(complete), false);
  uid = 'u1';
  assert.equal(await processIosWorkoutAction({ ...complete, action: 'finishWorkout' }), false);
  session!.rows[0].sets[0].completed = true;
  assert.equal(await processIosWorkoutAction({ ...complete, action: 'finishWorkout', expectedCompletedSets: 1 }), true);
  assert.equal(saves, 1);
  session = null;
  assert.equal(await processIosWorkoutAction(complete), false);
});
