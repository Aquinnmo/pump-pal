import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makeCatalogExercise, makePerformedExercise, makeWorkout } from '../factories';

let currentUid = 'muscle-load-test-0';
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
// router so the navigation row's user-visible action remains observable.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'muscle-load-summary-router-test-doubles',
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
const { MuscleLoadSummary } = await import('../../src/ui/muscle-load-summary');

beforeEach(async () => {
  currentUid = `muscle-load-test-${++uidSequence}`;
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

describe('MuscleLoadSummary', () => {
  it('renders an empty recent-work message when there are no workouts', async () => {
    const catalog = [makeCatalogExercise()];
    refreshCatalog = async () => ({ exercises: catalog, version: 1 });

    render(<MuscleLoadSummary workouts={[]} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Recent muscle load. No mapped work in the past 7 days.',
    });
    assert.equal(summary.textContent, 'Muscle FatigueNo muscle load detected in the past 7 days.');
  });

  it('shows a loading presentation until the catalog fetch resolves', async () => {
    let resolveCatalog!: (value: unknown) => void;
    refreshCatalog = () => new Promise((resolve) => { resolveCatalog = resolve; });

    render(<MuscleLoadSummary workouts={[]} />);
    assert.ok(screen.getByRole('button', {
      name: 'Recent muscle load. Mapping your recent work.',
    }));
    assert.equal(screen.queryByText('No muscle load detected in the past 7 days.'), null);

    resolveCatalog({ exercises: [makeCatalogExercise()], version: 1 });
    await settle();
    assert.ok(screen.getByText('No muscle load detected in the past 7 days.'));
  });

  it('renders populated load coverage and navigates to the full diagram', async () => {
    const catalog = [makeCatalogExercise()];
    refreshCatalog = async () => ({ exercises: catalog, version: 1 });
    const workout = makeWorkout({
      date: new Date(),
      performedExercises: [
        makePerformedExercise({ exerciseId: 'bench-press' }),
        makePerformedExercise({ exerciseId: 'unknown-exercise', exerciseNameSnapshot: 'Unknown exercise' }),
      ],
    });

    render(<MuscleLoadSummary workouts={[workout]} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Recent muscle load. Past 7 days. Some exercises are not mapped yet.',
    });
    assert.equal(summary.textContent, 'Muscle FatigueSome exercises could not be mapped.');
    fireEvent.click(summary);
    assert.deepEqual(routerPushes, ['/muscle-load']);
  });

  it('shows a user-legible unavailable message when catalog data cannot be loaded', async () => {
    refreshCatalog = async () => { throw new Error('catalog offline'); };
    readCatalog = async () => { throw new Error('catalog unavailable'); };

    render(<MuscleLoadSummary workouts={[]} />);
    await settle();

    const summary = screen.getByRole('button', {
      name: 'Recent muscle load. Exercise catalog unavailable. Open muscle load to try again.',
    });
    assert.ok(screen.getByText('Exercise catalog unavailable. Open muscle load to try again.'));
    assert.equal(summary.getAttribute('aria-label'), 'Recent muscle load. Exercise catalog unavailable. Open muscle load to try again.');
  });
});
