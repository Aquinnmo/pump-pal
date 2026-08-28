import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makeCatalogExercise, makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { CatalogExercise, Workout } from '@/types/workout';
import type { MuscleId } from '@/constants/muscles';

let catalog: CatalogExercise[] = [];
let holdCatalog = false;
let releaseCatalog: (() => void) | null = null;

mock.module('@/lib/exercise-catalog', () => ({
  loadCatalog: async () => {
    if (holdCatalog) {
      await new Promise<void>((resolve) => {
        releaseCatalog = resolve;
      });
    }
    return catalog;
  },
}));

// Keep the real development calculations and detail presentation while making
// the native map an accessible, deterministic interaction boundary.
mock.module(new URL('../../src/ui/muscle-map.tsx', import.meta.url).pathname, () => ({
  MuscleMap: ({
    accessibilityLabel,
    onSelectMuscle,
  }: {
    accessibilityLabel: string;
    onSelectMuscle: (muscle: MuscleId) => void;
  }) => (
    <>
      <div role="img" aria-label={accessibilityLabel} />
      <button type="button" onClick={() => onSelectMuscle('lats')}>
        Select lats
      </button>
    </>
  ),
}));
mock.module(new URL('../../src/ui/muscle-map-legend.tsx', import.meta.url).pathname, () => ({
  MuscleMapLegend: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <div role="img" aria-label={accessibilityLabel} />
  ),
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { DevelopmentProgress } = await import('../../src/ui/development-progress');

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
    makeWorkout({
      id: 'previous-workout',
      date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      performedExercises: [previous],
    }),
    makeWorkout({
      id: 'recent-workout',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      performedExercises: [recent],
    }),
  ];
}

beforeEach(() => {
  catalog = [];
  holdCatalog = false;
  releaseCatalog = null;
});

afterEach(() => {
  cleanup();
  releaseCatalog?.();
  releaseCatalog = null;
  holdCatalog = false;
});

describe('DevelopmentProgress', () => {
  it('renders the loading baseline until the catalog resolves', async () => {
    holdCatalog = true;
    render(<DevelopmentProgress workouts={[]} />);

    assert.ok(screen.getByRole('progressbar', { name: 'Loading Development Progress' }));
    assert.equal(screen.queryByText(/Not enough comparable history yet/), null);

    await waitFor(() => assert.ok(releaseCatalog));
    catalog = [catalogExercise()];
    await act(async () => {
      releaseCatalog?.();
      releaseCatalog = null;
      holdCatalog = false;
    });
    await waitFor(() => assert.ok(screen.getByText(/Not enough comparable history yet/)));
  });

  it('renders the empty metric guidance when there is no comparable history', async () => {
    catalog = [catalogExercise()];
    render(<DevelopmentProgress workouts={[]} />);

    await waitFor(() => assert.ok(screen.getByText(/Not enough comparable history yet/)));
    assert.equal(screen.queryByRole('img'), null);
  });

  it('renders populated grade, change, contributors, and partial mapping guidance', async () => {
    catalog = [catalogExercise()];
    const unmatched = makeWorkout({
      id: 'unmatched-workout',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      performedExercises: [
        makePerformedExercise({
          exerciseId: 'unmapped-exercise',
          exerciseNameSnapshot: 'Unmapped Exercise',
        }),
      ],
    });
    render(<DevelopmentProgress workouts={[...comparableWorkouts(), unmatched]} />);

    await waitFor(() => assert.ok(screen.getByText('Contributing exercises', { exact: true })));
    assert.ok(screen.getByText('Bench Press', { exact: true }));
    assert.ok(screen.getByText('A+', { exact: true }));
    assert.ok(screen.getAllByText('+25.0%', { exact: true }).length >= 1);
    assert.ok(screen.getByText('1 exercise entry was not mapped and excluded from this comparison.', { exact: true }));

    const map = screen.getByRole('img', { name: /Selected muscle: Chest\./ });
    assert.match(map.getAttribute('aria-label') ?? '', /Development grade A\+.*Performance change \+25\.0%/);

    fireEvent.click(screen.getByRole('button', { name: 'Select lats' }));
    await waitFor(() => assert.ok(screen.getByText('Not enough history for this muscle.', { exact: true })));
    assert.match(screen.getByRole('img', { name: /Selected muscle: Lats\./ }).getAttribute('aria-label') ?? '', /not enough history/);
  });

  it('renders a retryable catalog-unavailable state and recovers to metrics', async () => {
    render(<DevelopmentProgress workouts={comparableWorkouts()} />);

    await waitFor(() => assert.ok(screen.getByText('Exercise catalog unavailable. Tap to try again.', { exact: true })));
    catalog = [catalogExercise()];
    fireEvent.click(screen.getByRole('button', { name: 'Exercise catalog unavailable. Retry loading Development Progress.' }));

    await waitFor(() => assert.ok(screen.getByText(/Not enough comparable history yet|Contributing exercises/)));
  });
});
