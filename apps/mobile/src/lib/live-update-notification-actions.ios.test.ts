import assert from 'node:assert/strict';
import { mock, test } from 'bun:test';

let nativeListener: ((json: string) => void) | undefined;
let pending: string | null = null;
const acknowledgements: [string, boolean][] = [];
mock.module(new URL('../../modules/live-update-notification/index.ts', import.meta.url).pathname, () => ({
  subscribeActions: (listener: (json: string) => void) => { nativeListener = listener; return () => {}; },
  readPendingAction: () => pending,
  acknowledgeAction: async (id: string, succeeded: boolean) => { acknowledgements.push([id, succeeded]); pending = null; },
}));
mock.module(new URL('./active-workout-session.ts', import.meta.url).pathname, () => ({ flushSessionPersistence: async () => {} }));
const specifier = './live-update-notification-actions.ios';
const { subscribeLiveUpdateNotificationActions } = await import(specifier);

test('pending action is retained until the root handler completes and duplicate delivery is coalesced', async () => {
  let release!: () => void;
  let calls = 0;
  pending = JSON.stringify({ actionId: 'tap-1', action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 0 });
  const unsubscribe = subscribeLiveUpdateNotificationActions(async () => {
    calls++;
    await new Promise<void>(resolve => { release = resolve; });
  }, 'root');
  await Promise.resolve();
  assert.equal(calls, 1);
  nativeListener?.(pending!);
  assert.equal(calls, 1);
  assert.deepEqual(acknowledgements, []);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(acknowledgements, [['tap-1', true]]);
  unsubscribe();
});

test('handler failure is acknowledged as failure without consuming a future action', async () => {
  const unsubscribe = subscribeLiveUpdateNotificationActions(async () => { throw new Error('write failed'); }, 'root');
  nativeListener?.(JSON.stringify({ actionId: 'tap-2', action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 0 }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(acknowledgements, [['tap-1', true], ['tap-2', false]]);
  unsubscribe();
});
