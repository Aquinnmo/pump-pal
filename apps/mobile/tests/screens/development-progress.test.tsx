import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import { makeCatalogExercise, makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { CatalogExercise, Workout } from '@/types/workout';

const user = { uid: 'development-progress-screen-test-user' };
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

// Keep the real development metric, grade, contributor, and retry rendering
// while replacing native-only map and scroll surfaces at stable UI seams.
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
  name: 'development-progress-screen-test-doubles',
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

const { default: DevelopmentProgressScreen } = await import('../../app/development-progress');

function catalogExercise(): CatalogExercise {
  return makeCatalogExercise({
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
  });
}

function comparableWorkouts(): Workout[] {
  const previous = makePerformedExercise({
    exerciseId: 'bench-press',
    exerciseNameSnapshot: 'Bench Press',
    sets: [{ setNumber: 1, reps: 5, weight: 80, completed: true }],
  });
  const recent = makePerformedExercise({
    exerciseId: 'bench-press',
    exerciseNameSnapshot: 'Bench Press',
    sets: [{ setNumber: 1, reps: 5, weight: 100, completed: true }],
  });
  return [
    makeWorkout({ id: 'previous-workout', userId: user.uid, date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), performedExercises: [previous] }),
    makeWorkout({ id: 'recent-workout', userId: user.uid, date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), performedExercises: [recent] }),
  ];
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

describe('DevelopmentProgressScreen', () => {
  it('renders the signed-out baseline without reading workout history', async () => {
    currentUser = null;
    render(<DevelopmentProgressScreen />);
    await settle();

    assert.ok(screen.getByText('Sign in to view Development Progress', { exact: true }));
    assert.ok(screen.getByText('Development Progress is based on your logged workouts.', { exact: true }));
    assert.deepEqual(historyCalls, []);
  });

  it('renders loading until workout history resolves', async () => {
    holdHistory = true;
    render(<DevelopmentProgressScreen />);

    assert.ok(screen.getByRole('progressbar', { name: 'Loading Development Progress' }));
    assert.equal(screen.queryByText('No workouts yet', { exact: true }), null);

    await act(async () => {
      releaseHistory?.();
      releaseHistory = null;
      holdHistory = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
  });

  it('renders the empty baseline and starts a workout from the primary action', async () => {
    render(<DevelopmentProgressScreen />);
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));

    assert.ok(screen.getByText('Log sessions over time and Timber will compare how each muscle is developing.', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a workout' }));
    assert.deepEqual(pushed, ['/active-workout']);
  });

  it('renders the history error and retries through the visible action', async () => {
    historyError = new Error('offline');
    render(<DevelopmentProgressScreen />);
    await waitFor(() => assert.ok(screen.getByText('Workout history unavailable', { exact: true })));
    assert.ok(screen.getByText('Timber could not load your workout history, so it cannot calculate Development Progress.', { exact: true }));

    historyError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => assert.ok(screen.getByText('No workouts yet', { exact: true })));
    assert.equal(historyCalls.length, 2);
  });

  it('renders populated development grade, change, contributor metrics, and map semantics', async () => {
    history = comparableWorkouts();
    catalog = [catalogExercise()];
    render(<DevelopmentProgressScreen />);
    await waitFor(() => assert.ok(screen.getByText('Contributing exercises', { exact: true })));

    assert.ok(screen.getByText('Bench Press', { exact: true }));
    assert.ok(screen.getByText('A+', { exact: true }));
    assert.ok(screen.getAllByText('+25.0%', { exact: true }).length >= 1);
    assert.match(
      screen.getByRole('img', { name: /Selected muscle: Chest\./ }).getAttribute('aria-label') ?? '',
      /Development grade A\+.*Performance change \+25\.0%/,
    );
  });

  it('renders a catalog error from the populated metric boundary and retries it', async () => {
    history = comparableWorkouts();
    catalog = [];
    render(<DevelopmentProgressScreen />);
    await waitFor(() => assert.ok(screen.getByText('Exercise catalog unavailable. Tap to try again.', { exact: true })));

    catalog = [catalogExercise()];
    fireEvent.click(screen.getByRole('button', { name: 'Exercise catalog unavailable. Retry loading Development Progress.' }));
    await waitFor(() => assert.ok(screen.getByText('Contributing exercises', { exact: true })));
  });
});
