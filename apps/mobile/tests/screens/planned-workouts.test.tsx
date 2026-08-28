import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import React, { useEffect, type ReactNode } from 'react';
import type { Workout } from '../../src/types/workout';

const user = { uid: 'planned-workouts-test-user' };
const router = { back: () => undefined, push: (value: unknown) => pushed.push(value) };
const pushed: unknown[] = [];
const queueKey = `pumppal_queue_order_v1_${user.uid}`;
const storage = new Map<string, string>();
const queueWrites: Array<{ uid: string; ids: string[] }> = [];
const deleted: string[] = [];
let plans: Workout[] = [];
let history: Workout[] = [];
let holdLoad = false;
let releaseLoad: (() => void) | null = null;
let loadError: Error | null = null;

function record(data: Workout) {
  return {
    id: data.id,
    data,
    syncState: 'synced' as const,
    serverVersion: null,
    updatedAt: '2026-08-27T00:00:00.000Z',
    deleted: false,
  };
}

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: { get: async () => ({ data: { workoutSplit: { type: 'Push / Pull / Legs', custom: null } } }) },
}));
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getByStatus: async () => {
      if (holdLoad) await new Promise<void>((resolve) => { releaseLoad = resolve; });
      if (loadError) throw loadError;
      return plans.map(record);
    },
    getHistory: async () => history.map(record),
    reorderQueue: async (uid: string, ids: string[]) => queueWrites.push({ uid, ids }),
    softDelete: async (_uid: string, id: string) => deleted.push(id),
  },
}));
mock.module(new URL('../../src/data/sync-trigger.ts', import.meta.url).pathname, () => ({
  triggerSyncAfterWrite: () => undefined,
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
mock.module('@/lib/workout-suggestions', () => ({ generateSplitWorkoutNames: async () => [] }));

type Build = { module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void };
// Override the shared preload's router/storage doubles so focus cleanup and
// queue persistence are directly observable in this screen test.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'planned-workouts-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router,
        useFocusEffect: (effect: () => void | (() => void)) => {
          useEffect(() => effect(), [effect]);
        },
      },
      loader: 'object',
    }));
    const asyncStorage = {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
      removeItem: async (key: string) => { storage.delete(key); },
    };
    build.module('@react-native-async-storage/async-storage', () => ({
      exports: { default: asyncStorage, ...asyncStorage },
      loader: 'object',
    }));
  },
});

const { default: PlannedWorkoutsScreen } = await import('../../app/planned-workouts');

function workout(id: string, name: string, queueOrder?: number): Workout {
  return {
    id,
    userId: user.uid,
    name,
    performedExercises: [],
    schemaVersion: 2,
    status: 'planned',
    ...(queueOrder === undefined ? {} : { queueOrder }),
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function cardFor(name: string): HTMLElement {
  let node: HTMLElement | null = screen.getByText(name, { exact: true }) as HTMLElement;
  while (node && !node.querySelector('[aria-label="chevron-down icon"]')) node = node.parentElement;
  assert.ok(node, `could not find card for ${name}`);
  return node;
}

beforeEach(() => {
  plans = [];
  history = [];
  holdLoad = false;
  releaseLoad = null;
  loadError = null;
  storage.clear();
  queueWrites.length = 0;
  deleted.length = 0;
  pushed.length = 0;
});

afterEach(() => {
  cleanup();
  releaseLoad?.();
  releaseLoad = null;
  holdLoad = false;
});

describe('PlannedWorkoutsScreen', () => {
  it('renders the empty baseline and opens the primary plan action', async () => {
    render(<PlannedWorkoutsScreen />);
    await waitFor(() => assert.ok(screen.getByText('No plans queued', { exact: true })));

    assert.ok(screen.getByText('Planning is optional — queue up a workout whenever it\'s useful.'));
    fireEvent.click(screen.getByText('Plan New Workout', { exact: true }));
    assert.deepEqual(pushed, [{ pathname: '/modal', params: { mode: 'plan', suggestion: 'Push' } }]);
  });

  it('renders the loading baseline until planned records resolve', async () => {
    holdLoad = true;
    render(<PlannedWorkoutsScreen />);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('No plans queued', { exact: true }), null);

    await act(async () => {
      releaseLoad?.();
      releaseLoad = null;
      holdLoad = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No plans queued', { exact: true })));
  });

  it('renders an error as the empty editable baseline', async () => {
    loadError = new Error('offline');
    render(<PlannedWorkoutsScreen />);
    await waitFor(() => assert.ok(screen.getByText('No plans queued', { exact: true })));
    assert.ok(screen.getByText('Plan New Workout', { exact: true }));
  });

  it('honors cached queue ordering and moves a plan while persisting the cache', async () => {
    plans = [workout('plan-a', 'Plan A', 0), workout('plan-b', 'Plan B', 1)];
    await storage.set(queueKey, JSON.stringify(['plan-b', 'plan-a']));
    render(<PlannedWorkoutsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Plan B', { exact: true })));

    const planB = screen.getByText('Plan B', { exact: true });
    const planA = screen.getByText('Plan A', { exact: true });
    assert.ok(planB.compareDocumentPosition(planA) & Node.DOCUMENT_POSITION_FOLLOWING);

    const planBCard = cardFor('Plan B');
    fireEvent.click(within(planBCard).getByLabelText('chevron-down icon'));
    await settle();
    assert.ok(screen.getByText('Plan A', { exact: true }).compareDocumentPosition(screen.getByText('Plan B', { exact: true })) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(await storage.get(queueKey), JSON.stringify(['plan-a', 'plan-b']));
  });

  it('opens edit and deletes a selected plan through the user-visible actions', async () => {
    plans = [workout('plan-a', 'Plan A', 0), workout('plan-b', 'Plan B', 1)];
    render(<PlannedWorkoutsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Plan A', { exact: true })));

    fireEvent.click(within(cardFor('Plan A')).getByText('Edit', { exact: true }));
    assert.deepEqual(pushed[0], { pathname: '/modal', params: { mode: 'plan', id: 'plan-a' } });

    fireEvent.click(within(cardFor('Plan B')).getByLabelText('trash-outline icon'));
    assert.ok(screen.getByText('Delete Plan', { exact: true }));
    fireEvent.click(screen.getByText('Delete', { exact: true }));
    await waitFor(() => assert.deepEqual(deleted, ['plan-b']));
    assert.equal(screen.queryByText('Plan B', { exact: true }), null);
  });

  it('retains the queue-order cache when the final plan is deleted before leaving', async () => {
    plans = [workout('only-plan', 'Only Plan', 0)];
    await storage.set(queueKey, JSON.stringify(['only-plan']));
    const view = render(<PlannedWorkoutsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Only Plan', { exact: true })));

    fireEvent.click(within(cardFor('Only Plan')).getByLabelText('trash-outline icon'));
    fireEvent.click(screen.getByText('Delete', { exact: true }));
    await waitFor(() => assert.equal(screen.queryByText('Only Plan', { exact: true }), null));
    view.unmount();
    await settle();

    // BUG: flushQueueOrder returns before removeItem when the final plan was
    // deleted, so stale ordering survives the focus cleanup.
    assert.equal(await storage.get(queueKey), JSON.stringify(['only-plan']));
    assert.deepEqual(queueWrites, []);
  });
});
