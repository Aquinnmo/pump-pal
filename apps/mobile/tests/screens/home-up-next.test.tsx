import assert from 'node:assert/strict';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useEffect } from 'react';
import { makeWorkout } from '@/tests/factories';
import { bumpDataVersion } from '@/data/data-version';
import { endSession, startSession } from '@/lib/active-workout-session';
import type { Workout } from '@/types/workout';

const uid = 'user-1';
const user = { uid };
let history: Workout[] = [];
let planned: Workout[] = [];
let dismissCalls = 0;
let historyCalls = 0;
let pendingHistoryResolve: (() => void) | null = null;
let holdHistory = false;
const router = {
  push: (_path: unknown) => {},
  replace: (_path: unknown) => {},
  back: () => {},
};

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Keep the real screen and Up Next copy while replacing native-only rendering
// packages that cannot load in the web DOM harness.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'home-up-next-test-doubles',
  setup(build: Build) {
    build.module('@expo/vector-icons', () => ({
      exports: { Ionicons: () => null, MaterialIcons: () => null, default: () => null },
      loader: 'object',
    }));
    build.module('expo-router', () => ({
      exports: {
        router,
        useFocusEffect: (effect: () => void | (() => void)) => {
          useEffect(() => effect(), [effect]);
        },
      },
      loader: 'object',
    }));
    build.module('react-native-safe-area-context', () => ({
      exports: { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
      loader: 'object',
    }));
  },
});

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({
    user,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => {},
    signUp: async () => {},
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => {},
  }),
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => ({
      id: 'profile',
      data: {
        username: 'Test Athlete',
        workoutSplit: { type: 'Push / Pull / Legs', custom: null },
      },
      syncState: 'synced',
      serverVersion: null,
      updatedAt: '2026-08-27T00:00:00.000Z',
      deleted: false,
    }),
  },
}));
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async () => {
      historyCalls += 1;
      if (holdHistory) {
        await new Promise<void>((resolve) => { pendingHistoryResolve = resolve; });
      }
      return history.map((data) => ({
        id: data.id,
        data,
        syncState: 'synced' as const,
        serverVersion: null,
        updatedAt: '2026-08-27T00:00:00.000Z',
        deleted: false,
      }));
    },
    getByStatus: async () => planned.map((data) => ({
      id: data.id,
      data,
      syncState: 'synced' as const,
      serverVersion: null,
      updatedAt: '2026-08-27T00:00:00.000Z',
      deleted: false,
    })),
  },
}));
mock.module(new URL('../../src/lib/workout-notification.ts', import.meta.url).pathname, () => ({
  ensureWorkoutChannel: async () => 'home',
  requestNotificationPermission: async () => {},
  showWorkoutNotification: async () => {},
  dismissWorkoutNotification: async () => { dismissCalls += 1; },
}));

const { default: HomeScreen } = await import('../../app/(tabs)/index');

function workout(name: string, overrides: Partial<Workout> = {}): Workout {
  return makeWorkout({ name, status: 'completed', ...overrides });
}

async function renderHome() {
  render(<HomeScreen />);
  await waitFor(() => assert.ok(screen.getByRole('button', { name: /Resume|Start/ })));
}

beforeEach(() => {
  history = [];
  planned = [];
  dismissCalls = 0;
  historyCalls = 0;
  pendingHistoryResolve = null;
  holdHistory = false;
  endSession();
});

afterEach(() => {
  cleanup();
  endSession();
  pendingHistoryResolve?.();
  pendingHistoryResolve = null;
  holdHistory = false;
});

describe('Home Up Next priority', () => {
  it('prioritizes a matching live session over planned and predicted work', async () => {
    history = [workout('Push')];
    planned = [workout('Planned Pull', { status: 'planned', queueOrder: 0 })];
    startSession({
      uid,
      planId: null,
      name: 'Resume Bench Press',
      rows: [],
      cameFromPlan: false,
    });

    await renderHome();
    assert.ok(screen.getByRole('button', { name: /Resume Resume Bench Press/ }));
    assert.ok(screen.getByText('Resume workout'));
    assert.equal(dismissCalls, 0);
  });

  it('ignores a live session from another uid and uses the planned queue head', async () => {
    startSession({
      uid: 'other-user',
      planId: null,
      name: 'Other account session',
      rows: [],
      cameFromPlan: false,
    });
    planned = [
      workout('Undefined order', { status: 'planned', queueOrder: undefined }),
      workout('Second', { status: 'planned', queueOrder: 2 }),
      workout('Queue head', { status: 'planned', queueOrder: 1 }),
    ];

    await renderHome();
    assert.ok(screen.getByRole('button', { name: 'Start planned workout, Queue head' }));
    assert.equal(screen.queryByText('Other account session'), null);
    assert.equal(dismissCalls, 1);
  });

  it('falls back to the predicted split name when there is no live or planned work', async () => {
    history = [workout('Push')];

    await renderHome();
    assert.ok(screen.getByRole('button', { name: 'Start suggested workout, Pull' }));
    assert.ok(screen.getByText('Start workout'));
    assert.equal(dismissCalls, 1);
  });

  it('does not show a spinner during a focus refresh', async () => {
    history = [workout('Push')];
    await renderHome();
    assert.equal(screen.queryByRole('progressbar'), null);

    holdHistory = true;
    await act(async () => {
      bumpDataVersion();
    });
    await waitFor(() => assert.ok(historyCalls >= 2));
    assert.equal(screen.queryByRole('progressbar'), null);

    await act(async () => {
      pendingHistoryResolve?.();
      pendingHistoryResolve = null;
      holdHistory = false;
    });
  });
});
