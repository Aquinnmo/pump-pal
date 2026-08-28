import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';

const actionTaskCalls: unknown[] = [];
const actionTaskPath = new URL('./wear-action-task.ts', import.meta.url).pathname;

mock.module(actionTaskPath, () => ({
  handleWorkoutAction: async (action: unknown) => {
    actionTaskCalls.push(action);
  },
}));

const { showAlert } = await import('./alert');
const { syncStreakReminders } = await import('./streak-notification');
const { pushWearState, subscribeWearActions } = await import('./wear-sync');
const {
  ensureWorkoutChannel,
  requestNotificationPermission,
  showWorkoutNotification,
  dismissWorkoutNotification,
} = await import('./workout-notification');
const { subscribeLiveUpdateNotificationActions } = await import('./live-update-notification-actions');
const { liveUpdateNotificationActionTask } = await import('./live-update-notification-action-task');

afterEach(() => {
  actionTaskCalls.length = 0;
});

describe('web and cross-platform adapter helpers', () => {
  it('formats web alerts for the visible browser boundary', () => {
    const calls: string[] = [];
    const originalAlert = window.alert;
    window.alert = (message?: string) => calls.push(message ?? '');

    try {
      showAlert('Workout saved', 'Nice work.');
      showAlert('Workout ready');
    } finally {
      window.alert = originalAlert;
    }

    assert.deepEqual(calls, ['Workout saved\n\nNice work.', 'Workout ready']);
  });

  it('keeps unsupported web streak, Wear, notification, and live-action surfaces as safe no-ops', async () => {
    await syncStreakReminders({ active: true, startDate: '2026-08-27', todayCompleted: false });

    let wearActions = 0;
    const unsubscribeWear = subscribeWearActions(() => {
      wearActions += 1;
    });
    pushWearState({ ts: 1, mode: 'empty' });
    unsubscribeWear();

    let liveActions = 0;
    const unsubscribeLive = subscribeLiveUpdateNotificationActions(() => {
      liveActions += 1;
    });
    unsubscribeLive();

    assert.equal(await ensureWorkoutChannel(), 'active-workout');
    await requestNotificationPermission();
    await showWorkoutNotification({} as never);
    await dismissWorkoutNotification();
    assert.equal(wearActions, 0);
    assert.equal(liveActions, 0);
  });

  it('delegates valid headless actions and ignores malformed or cancelled payloads', async () => {
    await liveUpdateNotificationActionTask({
      json: JSON.stringify({ action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 1 }),
    });
    await liveUpdateNotificationActionTask({ json: '{not-json' });
    await liveUpdateNotificationActionTask({ json: JSON.stringify({ action: 'finishWorkout', workoutId: '' }) });
    await liveUpdateNotificationActionTask({});

    assert.deepEqual(actionTaskCalls, [
      { action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 1 },
    ]);
  });

});
