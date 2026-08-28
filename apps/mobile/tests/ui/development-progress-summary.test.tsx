import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makeCatalogExercise, makePerformedExercise, makeWorkout } from '../factories';

let currentUid = 'development-progress-test-0';
let uidSequence = 0;
let refreshCatalog: () => Promise<unknown> = async () => ({ exercises: [], version: 1 });
let readCatalog: () => Promise<unknown[]> = async () => [];
const routerPushes: string[] = [];

mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  auth: {
    get currentUser() {
      return { uid: currentUid };
    },
  },
}));

mock.module(new URL('../../src/data/catalog-repository.web.ts', import.meta.url).pathname, () => ({
  catalogRepository: {
    refresh: () => refreshCatalog(),
    getAll: () => readCatalog(),
  },
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The preload registers an expo-router double. Replace it with a controllable
// router so the summary's user-visible navigation remains observable.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'development-progress-summary-router-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { push: (href: string) => routerPushes.push(href) },
      },
      loader: 'object',
    }));
  },
});

const storage = await import('@react-native-async-storage/async-storage');
const { DevelopmentProgressSummary } = await import('../../src/ui/development-progress-summary');

beforeEach(async () => {
  currentUid = `development-progress-test-${++uidSequence}`;
  refreshCatalog = async () => ({ exercises: [], version: 1 });
  readCatalog = async () => [];
  routerPushes.length = 0;
  await storage.default.clear();
});

afterEach(() => {
  cleanup();
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function comparableWorkouts(includeUnknown = false) {
  const catalogExercise = makePerformedExercise({ exerciseId: 'bench-press' });
  const recentExercises = includeUnknown
    ? [catalogExercise, makePerformedExercise({ exerciseId: 'unknown-exercise', exerciseNameSnapshot: 'Unknown exercise' })]
    : [catalogExercise];
  return [
    makeWorkout({ date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), performedExercises: [catalogExercise] }),
    makeWorkout({ date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), performedExercises: recentExercises }),
  ];
}

describe('DevelopmentProgressSummary', () => {
  it('renders an empty-history message when there are no workouts', async () => {
    refreshCatalog = async () => ({ exercises: [makeCatalogExercise()], version: 1 });

    render(<DevelopmentProgressSummary workouts={[]} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Development Progress. Not enough comparable history yet.',
    });
    assert.equal(summary.textContent, 'Development ProgressNot enough comparable history yet.');
  });

  it('shows a loading presentation until the catalog fetch resolves', async () => {
    let resolveCatalog!: (value: unknown) => void;
    refreshCatalog = () => new Promise((resolve) => { resolveCatalog = resolve; });

    render(<DevelopmentProgressSummary workouts={[]} />);
    assert.ok(screen.getByRole('button', {
      name: 'Development Progress. Comparing your training.',
    }));
    assert.equal(screen.queryByText('Not enough comparable history yet.'), null);

    resolveCatalog({ exercises: [makeCatalogExercise()], version: 1 });
    await settle();
    assert.ok(screen.getByText('Not enough comparable history yet.'));
  });

  it('renders populated comparison coverage and navigates to the full view', async () => {
    refreshCatalog = async () => ({ exercises: [makeCatalogExercise()], version: 1 });

    render(<DevelopmentProgressSummary workouts={comparableWorkouts(true)} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Development Progress. Last 90 days compared with the previous 90 days. Some exercises could not be mapped.',
    });
    assert.equal(summary.textContent, 'Development ProgressSome exercises could not be mapped.');
    fireEvent.click(summary);
    assert.deepEqual(routerPushes, ['/development-progress']);
  });

  it('shows a user-legible unavailable message when catalog data cannot be loaded', async () => {
    refreshCatalog = async () => { throw new Error('catalog offline'); };
    readCatalog = async () => { throw new Error('catalog unavailable'); };

    render(<DevelopmentProgressSummary workouts={[]} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Development Progress. Exercise catalog unavailable. Open Development Progress to try again.',
    });
    assert.ok(screen.getByText('Exercise catalog unavailable. Open Development Progress to try again.'));
    assert.equal(summary.getAttribute('aria-label'), 'Development Progress. Exercise catalog unavailable. Open Development Progress to try again.');
  });
});
