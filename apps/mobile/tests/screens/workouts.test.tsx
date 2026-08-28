import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useEffect } from 'react';
import { bumpDataVersion } from '@/data/data-version';
import { makeWorkout } from '@/tests/factories';
import type { Workout } from '@/types/workout';

const uid = 'user-1';
const user = { uid };
let history: Workout[] = [];
let holdHistory = false;
let pendingHistoryResolve: (() => void) | null = null;
let softDeleteBehavior: () => Promise<void> = async () => undefined;
let softDeleteCalls: { uid: string; id: string }[] = [];
const router = {
  back: () => {},
  push: (_path: unknown) => {},
  replace: (_path: unknown) => {},
};

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Keep the real screen and WorkoutCard while replacing native-only rendering
// packages that are not needed to exercise pagination and deletion.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'workouts-test-doubles',
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
    build.module('expo-linear-gradient', () => ({
      exports: { LinearGradient: () => null },
      loader: 'object',
    }));
    build.module('react-native-safe-area-context', () => ({
      exports: { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
      loader: 'object',
    }));
    build.module('react-native-gesture-handler', () => ({
      exports: {
        Gesture: { Pan: () => {
          const pan = { onUpdate: () => pan, onEnd: () => pan };
          return pan;
        } },
        GestureDetector: ({ children }: { children?: unknown }) => children ?? null,
        GestureHandlerRootView: ({ children }: { children?: unknown }) => children ?? null,
      },
      loader: 'object',
    }));
    build.module('react-native-reanimated', () => ({
      exports: {
        default: {},
        runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
        useAnimatedStyle: (factory: () => unknown) => factory(),
        useSharedValue: (value: unknown) => ({ value }),
        withSpring: (value: unknown) => value,
        withTiming: (value: unknown) => value,
      },
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
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async () => {
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
    softDelete: async (deleteUid: string, id: string) => {
      softDeleteCalls.push({ uid: deleteUid, id });
      return softDeleteBehavior();
    },
  },
}));
mock.module('@/data/sync-trigger', () => ({ triggerSyncAfterWrite: () => {} }));

const { default: WorkoutsScreen } = await import('../../app/(tabs)/workouts');

function workout(index: number): Workout {
  return makeWorkout({
    id: `workout-${index}`,
    name: `Workout ${index}`,
    date: new Date(`2026-08-${String(Math.min(index, 28)).padStart(2, '0')}T00:00:00.000Z`),
  });
}

async function renderScreen() {
  render(<WorkoutsScreen />);
  await waitFor(() => assert.ok(screen.getByText('Past Workouts', { exact: true })));
}

function deleteButtonFor(name: string): HTMLElement {
  const nameNode = screen.getByText(name, { exact: true });
  const card = nameNode.parentElement?.parentElement?.parentElement;
  assert.ok(card);
  const buttons = card.querySelectorAll<HTMLElement>('[tabindex="0"]');
  assert.ok(buttons.length >= 2, `expected edit and delete buttons for ${name}`);
  return buttons[1]!;
}

async function deleteWorkout(name: string) {
  fireEvent.click(deleteButtonFor(name));
  await waitFor(() => assert.ok(screen.getByText('Delete', { exact: true })));
  await act(async () => {
    fireEvent.click(screen.getByText('Delete', { exact: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  history = [];
  holdHistory = false;
  pendingHistoryResolve = null;
  softDeleteBehavior = async () => undefined;
  softDeleteCalls = [];
});

afterEach(() => {
  cleanup();
  pendingHistoryResolve?.();
  pendingHistoryResolve = null;
  holdHistory = false;
});

describe('WorkoutsScreen pagination and deletion', () => {
  it('renders the loading and empty baselines', async () => {
    holdHistory = true;
    render(<WorkoutsScreen />);
    assert.ok(screen.getByRole('progressbar'));

    await act(async () => {
      pendingHistoryResolve?.();
      pendingHistoryResolve = null;
      holdHistory = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
    assert.ok(screen.getByText('Tap + to log your first workout', { exact: true }));
  });

  it('renders a populated first page and limits it to fifteen workouts', async () => {
    history = Array.from({ length: 16 }, (_, index) => workout(index + 1));
    await renderScreen();

    assert.ok(screen.getByText('Workout 1', { exact: true }));
    assert.equal(screen.queryByText('Workout 16', { exact: true }), null);
    assert.ok(screen.getByText('Next', { exact: true }));
  });

  it('resets to page zero on every focus refresh', async () => {
    history = Array.from({ length: 16 }, (_, index) => workout(index + 1));
    await renderScreen();
    fireEvent.click(screen.getByText('Next', { exact: true }));
    assert.ok(screen.getByText('Workout 16', { exact: true }));

    await act(async () => {
      bumpDataVersion();
    });
    await waitFor(() => assert.ok(screen.getByText('Workout 1', { exact: true })));
    assert.equal(screen.queryByText('Workout 16', { exact: true }), null);
  });

  it('leaves an empty current page when its last item is deleted', async () => {
    history = Array.from({ length: 16 }, (_, index) => workout(index + 1));
    await renderScreen();
    fireEvent.click(screen.getByText('Next', { exact: true }));
    assert.ok(screen.getByText('Workout 16', { exact: true }));

    await deleteWorkout('Workout 16');
    await waitFor(() => assert.equal(screen.queryByText('Workout 16', { exact: true }), null));
    assert.equal(screen.queryByText('Workout 15', { exact: true }), null);
    assert.ok(screen.getByText('Past Workouts', { exact: true }));
    assert.equal(softDeleteCalls.length, 1);
    assert.deepEqual(softDeleteCalls[0], { uid, id: 'workout-16' });
  });

  it('swallows delete failures and keeps the workout visible', async () => {
    history = [workout(1)];
    softDeleteBehavior = async () => { throw new Error('delete failed'); };
    await renderScreen();

    await deleteWorkout('Workout 1');
    await waitFor(() => assert.ok(screen.getByText('Workout 1', { exact: true })));
    assert.equal(softDeleteCalls.length, 1);
    assert.equal(screen.queryByText('No workouts yet', { exact: true }), null);
  });
});
