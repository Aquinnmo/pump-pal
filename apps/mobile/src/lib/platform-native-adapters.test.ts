import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';

const nativeAlert = {
  alert: (..._args: unknown[]) => {},
};
const nativeReactModule = {
  Alert: nativeAlert,
  Platform: { OS: 'ios' },
};
mock.module('react-native', () => nativeReactModule);
mock.module('react-native-web', () => nativeReactModule);
mock.module(new URL('../../../../node_modules/react-native/index.js', import.meta.url).pathname, () => nativeReactModule);

const wearPushes: string[] = [];
let wearPushError: unknown = null;
let wearListener: ((event: { json: string }) => void) | undefined;
let wearRemoveCalls = 0;
const wearNativeModule = {
  pushState: (json: string) => {
    if (wearPushError) throw wearPushError;
    wearPushes.push(json);
    return true;
  },
  addListener: (_event: string, listener: (event: { json: string }) => void) => {
    wearListener = listener;
    return { remove: () => { wearRemoveCalls += 1; } };
  },
};

const liveActions: ((json: string) => void)[] = [];
let liveUnsubscribeCalls = 0;

const notificationCalls = {
  createChannel: [] as unknown[],
  requestPermission: 0,
  display: [] as unknown[],
  cancel: [] as unknown[],
};
const liveNotificationCalls = {
  nativeModuleAvailable: true,
  supported: false,
  showResult: true,
  show: [] as unknown[],
  dismiss: 0,
};
const streakNotificationCalls = {
  cancelTrigger: [] as unknown[],
  requestPermission: 0,
  createChannel: [] as unknown[],
  createTrigger: [] as unknown[],
};

mock.module(new URL('../../modules/wear-sync/index.ts', import.meta.url).pathname, () => ({
  wearSyncNativeModule: wearNativeModule,
}));
mock.module(new URL('../../modules/live-update-notification/index.ts', import.meta.url).pathname, () => ({
  subscribeActions: (listener: (json: string) => void) => {
    liveActions.push(listener);
    return () => { liveUnsubscribeCalls += 1; };
  },
  isSupported: () => liveNotificationCalls.supported,
  isNativeModuleAvailable: () => liveNotificationCalls.nativeModuleAvailable,
  drainPendingAction: () => null,
  show: (payload: unknown) => {
    liveNotificationCalls.show.push(payload);
    return liveNotificationCalls.showResult;
  },
  dismiss: () => { liveNotificationCalls.dismiss += 1; },
}));
type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'platform-native-adapter-test-doubles',
  setup(build: Build) {
    build.module('@notifee/react-native', () => ({
      exports: {
        default: {
          createChannel: async (value: unknown) => {
            notificationCalls.createChannel.push(value);
            streakNotificationCalls.createChannel.push(value);
            return 'active-workout';
          },
          requestPermission: async () => {
            notificationCalls.requestPermission += 1;
            streakNotificationCalls.requestPermission += 1;
          },
          displayNotification: async (value: unknown) => { notificationCalls.display.push(value); },
          cancelNotification: async (value: unknown) => { notificationCalls.cancel.push(value); },
          cancelTriggerNotifications: async (value: unknown) => { streakNotificationCalls.cancelTrigger.push(value); },
          createTriggerNotification: async (...value: unknown[]) => { streakNotificationCalls.createTrigger.push(value); },
        },
        AndroidImportance: { LOW: 'low', HIGH: 'high' },
        TriggerType: { TIMESTAMP: 'timestamp' },
      },
      loader: 'object',
    }));
  },
});

const { pushWearState, subscribeWearActions } = await import('./wear-sync.android');
const { subscribeLiveUpdateNotificationActions } = await import('./live-update-notification-actions.android');
const { subscribeLiveUpdateNotificationActions: subscribeLiveUpdateNotificationActionsIos } =
  await import('./live-update-notification-actions.ios');
const {
  ensureWorkoutChannel,
  requestNotificationPermission,
  showWorkoutNotification,
  dismissWorkoutNotification,
} = await import('./workout-notification.android');
const { showAlert: showNativeAlert } = await import('./alert');
const { syncStreakReminders } = await import('./streak-notification.native');
const {
  ensureWorkoutChannel: ensureIosWorkoutChannel,
  requestNotificationPermission: requestIosNotificationPermission,
  showWorkoutNotification: showIosWorkoutNotification,
  dismissWorkoutNotification: dismissIosWorkoutNotification,
} = await import('./workout-notification.ios');

afterEach(async () => {
  await dismissWorkoutNotification();
  await dismissIosWorkoutNotification();
  wearPushError = null;
  wearPushes.length = 0;
  wearListener = undefined;
  wearRemoveCalls = 0;
  liveActions.length = 0;
  liveUnsubscribeCalls = 0;
  notificationCalls.createChannel.length = 0;
  notificationCalls.requestPermission = 0;
  notificationCalls.display.length = 0;
  notificationCalls.cancel.length = 0;
  liveNotificationCalls.supported = false;
  liveNotificationCalls.nativeModuleAvailable = true;
  liveNotificationCalls.showResult = true;
  liveNotificationCalls.show.length = 0;
  liveNotificationCalls.dismiss = 0;
  streakNotificationCalls.cancelTrigger.length = 0;
  streakNotificationCalls.requestPermission = 0;
  streakNotificationCalls.createChannel.length = 0;
  streakNotificationCalls.createTrigger.length = 0;
});

const workoutData = {
  workoutId: 'w1',
  startedAt: new Date(1_000),
  completedSets: 1,
  totalSets: 2,
  segments: [],
  title: 'Push Day',
  detail: 'Bench press',
  actions: [],
};

describe('native adapter helpers at their module seams', () => {
  it('uses the native Alert boundary and preserves an omitted message', () => {
    const calls: unknown[][] = [];
    const originalAlert = nativeAlert.alert;
    nativeAlert.alert = (...args: unknown[]) => calls.push(args);

    try {
      showNativeAlert('Workout saved', 'Nice work.');
      showNativeAlert('Workout ready');
    } finally {
      nativeAlert.alert = originalAlert;
    }

    assert.deepEqual(calls, [
      ['Workout saved', 'Nice work.'],
      ['Workout ready', undefined],
    ]);
  });

  it('delegates Wear state, accepts known actions, drops malformed actions, and unsubscribes', () => {
    pushWearState({ ts: 7, mode: 'empty' });
    assert.deepEqual(wearPushes, [JSON.stringify({ ts: 7, mode: 'empty' })]);

    const actions: unknown[] = [];
    const unsubscribe = subscribeWearActions((action) => actions.push(action));
    wearListener?.({ json: JSON.stringify({ action: 'completeSet', workoutId: 'w1' }) });
    wearListener?.({ json: JSON.stringify({ action: 'unknown', workoutId: 'w1' }) });
    wearListener?.({ json: '{not-json' });
    unsubscribe();

    assert.deepEqual(actions, [{ action: 'completeSet', workoutId: 'w1' }]);
    assert.equal(wearRemoveCalls, 1);
  });

  it('swallows Wear push failures at the native boundary', () => {
    wearPushError = new Error('watch unavailable');
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      pushWearState({ ts: 7, mode: 'empty' });
    } finally {
      console.warn = originalWarn;
    }

    assert.deepEqual(wearPushes, []);
    assert.deepEqual(warnings, [['Wear state push failed', wearPushError]]);
  });

  it('delegates live-action parsing and preserves cancellation through unsubscribe', () => {
    const actions: unknown[] = [];
    const unsubscribe = subscribeLiveUpdateNotificationActions((action) => actions.push(action));
    liveActions[0]?.(JSON.stringify({ action: 'uncompleteSet', workoutId: 'w1', expectedCompletedSets: 0 }));
    liveActions[0]?.(JSON.stringify({ action: 'finishWorkout', workoutId: '' }));
    liveActions[0]?.('{not-json');
    unsubscribe();

    assert.deepEqual(actions, [{ action: 'uncompleteSet', workoutId: 'w1', expectedCompletedSets: 0 }]);
    assert.equal(liveUnsubscribeCalls, 1);
  });

  it('delivers valid iOS live actions through the ownership subscription seam', () => {
    const actions: unknown[] = [];
    const unsubscribe = subscribeLiveUpdateNotificationActionsIos((action) => actions.push(action), 'root');
    liveActions[0]?.(JSON.stringify({ action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 1 }));
    liveActions[0]?.(JSON.stringify({ action: 'completeSet', workoutId: '', expectedCompletedSets: 1 }));
    unsubscribe();

    assert.deepEqual(actions, [{ action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 1 }]);
    assert.equal(liveUnsubscribeCalls, 1);
  });

  it('uses the Notifee fallback when the optional Live Update surface is unavailable', async () => {
    assert.equal(await ensureWorkoutChannel(), 'active-workout');
    assert.equal(notificationCalls.createChannel.length, 1);
    await requestNotificationPermission();
    await showWorkoutNotification(workoutData);

    assert.equal(liveNotificationCalls.dismiss, 1);
    assert.equal(notificationCalls.display.length, 1);
    assert.deepEqual(notificationCalls.display[0], {
      id: 'active-workout',
      title: 'Push Day',
      body: 'Bench press',
      android: {
        channelId: 'active-workout',
        ongoing: true,
        onlyAlertOnce: true,
        showChronometer: true,
        timestamp: 1_000,
        pressAction: { id: 'default' },
        smallIcon: 'ic_stat_timber',
      },
    });
  });

  it('uses Live Update when posting succeeds and cancels stale Notifee output', async () => {
    liveNotificationCalls.supported = true;
    assert.equal(await ensureWorkoutChannel(), 'active-workout');
    await showWorkoutNotification(workoutData);

    assert.equal(liveNotificationCalls.show.length, 1);
    assert.equal(notificationCalls.cancel.at(-1), 'active-workout');
    assert.equal(notificationCalls.display.length, 0);
  });

  it('latches to Notifee after a rejected Live Update post', async () => {
    liveNotificationCalls.supported = true;
    liveNotificationCalls.showResult = false;
    await ensureWorkoutChannel();
    await showWorkoutNotification(workoutData);
    assert.equal(notificationCalls.display.length, 1);

    liveNotificationCalls.showResult = true;
    await showWorkoutNotification(workoutData);
    assert.equal(liveNotificationCalls.show.length, 1);
    assert.equal(notificationCalls.display.length, 2);
  });

  it('cancels stale streak reminders and schedules the three active one-shot notices', async () => {
    const RealDate = Date;
    const frozenMilliseconds = RealDate.parse('2026-08-27T12:00:00Z');
    class FrozenDate extends RealDate {
      constructor(value?: string | number | Date) {
        if (value === undefined) super(frozenMilliseconds);
        else if (value instanceof RealDate) super(value.getTime());
        else super(value);
      }
      static now() {
        return frozenMilliseconds;
      }
    }
    globalThis.Date = FrozenDate as unknown as DateConstructor;

    try {
      await syncStreakReminders({ active: false, startDate: '2026-08-27', todayCompleted: false });
      assert.deepEqual(streakNotificationCalls.cancelTrigger, [['streak-nudge', 'streak-last-call', 'streak-lost']]);
      assert.equal(streakNotificationCalls.requestPermission, 0);
      assert.equal(streakNotificationCalls.createTrigger.length, 0);

      await syncStreakReminders({ active: true, startDate: '2026-08-27', todayCompleted: false });
      assert.equal(streakNotificationCalls.requestPermission, 1);
      assert.deepEqual(streakNotificationCalls.createChannel, [{
        id: 'streak-reminder',
        name: 'Streak Reminders',
        importance: 'high',
      }]);
      assert.equal(streakNotificationCalls.createTrigger.length, 3);

      const reminders = streakNotificationCalls.createTrigger as [Record<string, unknown>, Record<string, unknown>][];
      assert.deepEqual(reminders.map(([notification]) => notification.id), [
        'streak-nudge',
        'streak-last-call',
        'streak-lost',
      ]);
      assert.deepEqual(reminders.map(([notification]) => notification.body), [
        'Day 1 — 1 pushup left today.',
        'Day 1 — 1 pushup. Your streak dies at midnight.',
        'You missed a day, so the streak reset. Start again today — Day 1, 1 pushup.',
      ]);
      assert.deepEqual(reminders.map(([, trigger]) => trigger), [
        { type: 'timestamp', timestamp: new RealDate('2026-08-27T18:00:00Z').getTime() },
        { type: 'timestamp', timestamp: new RealDate('2026-08-27T22:00:00Z').getTime() },
        { type: 'timestamp', timestamp: new RealDate('2026-08-28T09:00:00Z').getTime() },
      ]);
    } finally {
      globalThis.Date = RealDate;
    }
  });

  it('posts iOS Live Activity payloads only when the native capability is usable', async () => {
    liveNotificationCalls.nativeModuleAvailable = false;
    await showIosWorkoutNotification(workoutData);
    assert.equal(liveNotificationCalls.show.length, 0);

    liveNotificationCalls.nativeModuleAvailable = true;
    liveNotificationCalls.supported = false;
    await showIosWorkoutNotification(workoutData);
    assert.equal(liveNotificationCalls.show.length, 0);

    liveNotificationCalls.supported = true;
    liveNotificationCalls.showResult = true;
    assert.equal(await ensureIosWorkoutChannel(), 'active-workout');
    await requestIosNotificationPermission();
    await showIosWorkoutNotification(workoutData);
    assert.deepEqual(liveNotificationCalls.show, [{
      workoutId: 'w1',
      expectedCompletedSets: 1,
      title: 'Push Day',
      text: 'Bench press',
      startedAtMillis: 1_000,
      shortCriticalText: '1/2',
      progress: 1,
      segments: [],
      actions: [],
    }]);
    await dismissIosWorkoutNotification();
    assert.equal(liveNotificationCalls.dismiss, 1);

    liveNotificationCalls.showResult = false;
    await showIosWorkoutNotification(workoutData);
    assert.equal(liveNotificationCalls.show.length, 2);
  });
});
