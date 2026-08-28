import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useEffect, type ReactNode } from 'react';
import { makeWorkout } from '@/tests/factories';
import type { PerformedExercise, PerformedSet, Workout } from '@/types/workout';

const user = { uid: 'analytics-screen-test-user' };
const pushed: unknown[] = [];
const router = { push: (path: unknown) => pushed.push(path) };
let history: Workout[] = [];
let holdHistory = false;
let releaseHistory: (() => void) | null = null;
let historyError: Error | null = null;
const historyCalls: string[] = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => ({ data: { aiEnabled: false } }),
  },
}));
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async (uid: string) => {
      historyCalls.push(uid);
      if (holdHistory) {
        await new Promise<void>((resolve) => { releaseHistory = resolve; });
      }
      if (historyError) throw historyError;
      return history.map((data) => ({
        id: data.id,
        data,
        syncState: 'synced' as const,
        serverVersion: null,
        updatedAt: '2026-08-27T00:00:00.000Z',
        deleted: false,
      }));
    },
  },
}));

// These are separate metric surfaces with their own repository/catalog behavior.
// Keep the analytics screen's inline aggregation real while making this test
// boundary-specific and deterministic.
mock.module(new URL('../../src/ui/muscle-insight-cards.tsx', import.meta.url).pathname, () => ({
  MuscleInsightCards: () => null,
}));
mock.module(new URL('../../src/ui/muscle-load-summary.tsx', import.meta.url).pathname, () => ({
  MuscleLoadSummary: () => <div>Muscle load summary</div>,
}));
mock.module(new URL('../../src/ui/development-progress-summary.tsx', import.meta.url).pathname, () => ({
  DevelopmentProgressSummary: () => <div>Development progress summary</div>,
}));
mock.module(new URL('../../src/ui/set-consistency-summary.tsx', import.meta.url).pathname, () => ({
  SetConsistencySummary: () => <div>Set consistency summary</div>,
}));
mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({
    accessibilityLabel,
    options,
    value,
    onSelect,
    placeholder,
  }: {
    accessibilityLabel: string;
    options: string[];
    value: string | null;
    onSelect: (value: string) => void;
    placeholder: string;
  }) => (
    <div>
      <button aria-label={accessibilityLabel} onClick={() => options[0] && onSelect(options[0])}>
        {value ?? placeholder}
      </button>
      <span aria-label={`${accessibilityLabel} options`}>{options.join(', ')}</span>
    </div>
  ),
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));
mock.module('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
mock.module('react-native-chart-kit', () => ({
  LineChart: () => <div role="img" aria-label="line chart" />,
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Override the shared preload's router/focus double so navigation remains
// observable without mounting Expo Router.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'analytics-screen-test-doubles',
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
  },
});

const { default: AnalyticsScreen } = await import('../../app/(tabs)/analytics');

function performed(
  name: string,
  sets: PerformedSet[],
  overrides: Partial<PerformedExercise> = {},
): PerformedExercise {
  return {
    order: 0,
    exerciseId: name.toLowerCase().replaceAll(' ', '-'),
    exerciseRefPath: `exercises/${name.toLowerCase().replaceAll(' ', '-')}`,
    exerciseNameSnapshot: name,
    variationId: null,
    variationNameSnapshot: null,
    sets,
    ...overrides,
  };
}

function workout(id: string, name: string, date: string, exercises: PerformedExercise[]): Workout {
  return makeWorkout({ id, name, date, performedExercises: exercises });
}

function weightedSet(weight: number, reps: number): PerformedSet {
  return { setNumber: 1, weight, reps, bodyweight: false };
}

function bodyweightSet(reps: number): PerformedSet {
  return { setNumber: 1, reps, weight: 0, bodyweight: true };
}

function durationSet(durationSeconds: number): PerformedSet {
  return { setNumber: 1, durationSeconds };
}

beforeEach(() => {
  history = [];
  holdHistory = false;
  releaseHistory = null;
  historyError = null;
  historyCalls.length = 0;
  pushed.length = 0;
});

afterEach(() => {
  cleanup();
  releaseHistory?.();
  releaseHistory = null;
  holdHistory = false;
});

describe('AnalyticsScreen', () => {
  it('renders the loading baseline until workout history resolves', async () => {
    holdHistory = true;
    render(<AnalyticsScreen />);
    assert.ok(screen.getByRole('progressbar', { name: 'Loading analytics' }));
    assert.equal(screen.queryByText('Your progress starts with one workout', { exact: true }), null);

    await act(async () => {
      releaseHistory?.();
      releaseHistory = null;
      holdHistory = false;
    });
    await waitFor(() => assert.ok(screen.getByText('Your progress starts with one workout', { exact: true })));
  });

  it('renders the empty baseline and opens the primary workout action', async () => {
    render(<AnalyticsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Your progress starts with one workout', { exact: true })));

    assert.ok(screen.getByText('Log a session and Timber will turn it into records, trends, and muscle load.'));
    fireEvent.click(screen.getByRole('button', { name: 'Start a workout' }));
    assert.deepEqual(pushed, ['/active-workout']);
  });

  it('renders the error baseline and retries history loading', async () => {
    historyError = new Error('offline');
    render(<AnalyticsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Couldn’t load analytics', { exact: true })));

    historyError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading analytics' }));
    await waitFor(() => assert.ok(screen.getByText('Your progress starts with one workout', { exact: true })));
    assert.equal(historyCalls.length, 2);
  });

  it('renders estimated 1RM current/record/progress and all-time weighted, bodyweight, and duration metrics', async () => {
    const bench = (weight: number) => performed('Bench Press', [weightedSet(weight, 5)]);
    history = [
      workout('w-push-latest', 'Push', '2026-01-10T12:00:00.000Z', [bench(110)]),
      workout('w-pull-latest', 'Pull', '2026-01-09T12:00:00.000Z', [performed('Pull Ups', [bodyweightSet(12)])]),
      workout('w-pull-old', 'Pull', '2026-01-02T12:00:00.000Z', [performed('Plank', [durationSet(125)])]),
      workout('w-push-old', 'Push', '2026-01-01T12:00:00.000Z', [bench(100)]),
    ];
    render(<AnalyticsScreen />);
    await waitFor(() => assert.ok(screen.getAllByText('Bench Press', { exact: true }).length > 0));

    const summary = screen.getByLabelText(/Estimated 1RM summary for Bench Press/);
    assert.match(summary.getAttribute('aria-label') ?? '', /Current 128 lbs/);
    assert.match(summary.getAttribute('aria-label') ?? '', /All-time record 128 lbs/);
    assert.match(summary.getAttribute('aria-label') ?? '', /Change since first session \+12 lbs/);
    assert.equal(screen.getAllByText('110 lbs', { exact: true }).length, 2);
    assert.ok(screen.getByText('12 reps', { exact: true }));
    assert.ok(screen.getByText('2m 5s', { exact: true }));
    assert.ok(screen.getByLabelText('Favorite Exercise. Bench Press'));
    assert.ok(screen.getByLabelText('Heaviest Lift. Bench Press. 110 lbs'));
    assert.ok(screen.getByLabelText('Exercise for Max Weight options').textContent?.includes('Bench Press'));
    assert.ok(screen.getByLabelText('Exercise for Max Reps options').textContent?.includes('Pull Ups'));
    assert.ok(screen.getByLabelText('Exercise for Longest Duration options').textContent?.includes('Plank'));
  });

  it('keeps bodyweight and duration sets out of estimated 1RM while exposing their dedicated records', async () => {
    history = [
      workout('w-body', 'Body Day', '2026-02-01T12:00:00.000Z', [performed('Push Ups', [bodyweightSet(20)])]),
      workout('w-duration', 'Conditioning', '2026-02-02T12:00:00.000Z', [performed('Wall Sit', [durationSet(90)])]),
    ];
    render(<AnalyticsScreen />);
    await waitFor(() => assert.ok(screen.getAllByText('Push Ups', { exact: true }).length > 0));

    assert.ok(screen.getByText('Build your Strength-O-Meter', { exact: true }));
    assert.ok(screen.getAllByText('20 reps', { exact: true }).length > 0);
    assert.ok(screen.getAllByText('1m 30s', { exact: true }).length > 0);
    assert.equal(screen.queryByText('Personal record', { exact: true }), null);
  });

  it('preserves the favorite workout tie-break based on the overwritten oldest date', async () => {
    history = [
      workout('w-push-latest', 'Push', '2026-01-10T12:00:00.000Z', [performed('Bench Press', [weightedSet(110, 5)])]),
      workout('w-pull-latest', 'Pull', '2026-01-09T12:00:00.000Z', [performed('Row', [weightedSet(90, 5)])]),
      workout('w-pull-old', 'Pull', '2026-01-02T12:00:00.000Z', [performed('Row', [weightedSet(90, 5)])]),
      workout('w-push-old', 'Push', '2026-01-01T12:00:00.000Z', [performed('Bench Press', [weightedSet(100, 5)])]),
    ];
    render(<AnalyticsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Favorite Workout Type', { exact: true })));

    // BUG: workoutTypeLastDate is overwritten in iteration order, so the
    // equal-count tie compares the oldest occurrence instead of the latest.
    assert.ok(screen.getByLabelText('Favorite Workout Type. Pull'));
  });
});
