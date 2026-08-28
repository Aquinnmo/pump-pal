import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import { makeCatalogExercise, makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { CatalogExercise, Workout } from '@/types/workout';

const user = { uid: 'muscle-load-screen-test-user' };
let currentUser: typeof user | null = user;
let history: Workout[] = [];
let historyError: Error | null = null;
let holdHistory = false;
let releaseHistory: (() => void) | null = null;
let catalog: CatalogExercise[] = [];
let holdCatalog = false;
let releaseCatalog: (() => void) | null = null;
const historyCalls: string[] = [];
const pushed: string[] = [];

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

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
}));

mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async (uid: string) => {
      historyCalls.push(uid);
      if (holdHistory) {
        await new Promise<void>((resolve) => { releaseHistory = resolve; });
      }
      if (historyError) throw historyError;
      return history.map(record);
    },
  },
}));

mock.module('@/lib/exercise-catalog', () => ({
  loadCatalog: async () => {
    if (holdCatalog) {
      await new Promise<void>((resolve) => { releaseCatalog = resolve; });
    }
    return catalog;
  },
}));

// Keep MuscleLoadMap's visible detail rendering real while replacing only its
// native SVG/dropdown surfaces, so the route test observes the computed load
// and contributor copy at a stable presentation boundary.
mock.module(new URL('../../src/ui/muscle-map.tsx', import.meta.url).pathname, () => ({
  MuscleMap: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <div role="img" aria-label={accessibilityLabel} />
  ),
}));
mock.module(new URL('../../src/ui/muscle-map-legend.tsx', import.meta.url).pathname, () => ({
  MuscleMapLegend: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <div role="img" aria-label={accessibilityLabel} />
  ),
}));
mock.module(new URL('../../src/ui/primitives/fading-scroll-view.tsx', import.meta.url).pathname, () => ({
  FadingScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));
mock.module('expo-linear-gradient', () => ({ LinearGradient: () => null }));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Expo Router's native Stack is not needed here; keep the route's primary
// action observable without mounting the router navigator.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'muscle-load-screen-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { push: (href: string) => pushed.push(href) },
        Stack: { Screen: () => null },
      },
      loader: 'object',
    }));
  },
});

const { default: MuscleLoadScreen } = await import('../../app/muscle-load');

function catalogExercise(): CatalogExercise {
  return makeCatalogExercise({
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
  });
}

function mappedWorkout(): Workout {
  return makeWorkout({
    id: 'recent-workout',
    userId: user.uid,
    date: new Date(),
    performedExercises: [makePerformedExercise({
      exerciseId: 'bench-press',
      exerciseNameSnapshot: 'Bench Press',
      sets: [{ setNumber: 1, reps: 8, weight: 100, completed: true }],
    })],
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  currentUser = user;
  history = [];
  historyError = null;
  holdHistory = false;
  releaseHistory = null;
  catalog = [];
  holdCatalog = false;
  releaseCatalog = null;
  historyCalls.length = 0;
  pushed.length = 0;
});

afterEach(() => {
  cleanup();
  releaseHistory?.();
  releaseHistory = null;
  holdHistory = false;
  releaseCatalog?.();
  releaseCatalog = null;
  holdCatalog = false;
});

describe('MuscleLoadScreen', () => {
  it('renders the signed-out baseline without reading workout or catalog data', async () => {
    currentUser = null;
    render(<MuscleLoadScreen />);
    await settle();

    assert.ok(screen.getByText('Sign in to view muscle load', { exact: true }));
    assert.ok(screen.getByText('Muscle load is based on your logged workouts.', { exact: true }));
    assert.deepEqual(historyCalls, []);
  });

  it('renders loading until the workout and catalog boundaries resolve', async () => {
    holdCatalog = true;
    catalog = [catalogExercise()];
    render(<MuscleLoadScreen />);

    assert.ok(screen.getByRole('progressbar', { name: 'Mapping your recent muscle work' }));
    assert.equal(screen.queryByText('No workouts yet', { exact: true }), null);

    await act(async () => {
      releaseCatalog?.();
      releaseCatalog = null;
      holdCatalog = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
  });

  it('renders the empty baseline and starts a workout from the primary action', async () => {
    catalog = [catalogExercise()];
    render(<MuscleLoadScreen />);
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));

    assert.ok(screen.getByText('Log a session and Timber will map the work across your muscles.', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a workout' }));
    assert.deepEqual(pushed, ['/active-workout']);
  });

  it('renders the workout-history error and retries through the visible action', async () => {
    catalog = [catalogExercise()];
    historyError = new Error('offline');
    render(<MuscleLoadScreen />);
    await waitFor(() => assert.ok(screen.getByText('Workout history unavailable', { exact: true })));
    assert.ok(screen.getByText('Timber could not load your workout history, so it cannot calculate muscle load.', { exact: true }));

    historyError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
    assert.equal(historyCalls.length, 2);
  });

  it('renders catalog unavailability and recovers when the retry succeeds', async () => {
    catalog = [];
    render(<MuscleLoadScreen />);
    await waitFor(() => assert.ok(screen.getByText('Muscle map unavailable', { exact: true })));
    assert.ok(screen.getByText('The exercise catalog could not be loaded, so Timber cannot safely map your work.', { exact: true }));

    catalog = [catalogExercise()];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
  });

  it('renders computed populated load details and coverage for recent workouts', async () => {
    catalog = [catalogExercise()];
    history = [mappedWorkout()];
    render(<MuscleLoadScreen />);
    await waitFor(() => assert.ok(screen.getByText('Top contributors', { exact: true })));

    assert.ok(screen.getByText('Bench Press', { exact: true }));
    assert.ok(screen.getByText('Last worked', { exact: true }));
    assert.ok(screen.getAllByText(/\d+%/, { exact: true }).length >= 1);
    assert.match(
      screen.getByRole('img', { name: /Selected muscle: Chest\./ }).getAttribute('aria-label') ?? '',
      /Chest\./,
    );
  });

  it('keeps the loading presentation until a held workout read resolves', async () => {
    holdHistory = true;
    catalog = [catalogExercise()];
    render(<MuscleLoadScreen />);
    assert.ok(screen.getByRole('progressbar', { name: 'Mapping your recent muscle work' }));

    await act(async () => {
      releaseHistory?.();
      releaseHistory = null;
      holdHistory = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
  });
});
