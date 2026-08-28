import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { MuscleId } from '@/constants/muscles';
import { MUSCLES } from '@/constants/muscles';
import type { MuscleLoadResult, MuscleLoadStat } from '@/lib/muscle-load';

mock.module(new URL('../../src/ui/muscle-map.tsx', import.meta.url).pathname, () => ({
  MuscleMap: ({
    accessibilityLabel,
    onSelectMuscle,
  }: {
    accessibilityLabel: string;
    onSelectMuscle: (muscle: MuscleId) => void;
  }) => (
    <button
      aria-label={accessibilityLabel}
      onClick={() => onSelectMuscle('triceps')}
    >
      Select Triceps
    </button>
  ),
}));
mock.module(new URL('../../src/ui/muscle-map-legend.tsx', import.meta.url).pathname, () => ({
  MuscleMapLegend: ({ accessibilityLabel, labels }: { accessibilityLabel: string; labels: readonly string[] }) => (
    <div aria-label={accessibilityLabel}>{labels.join(' · ')}</div>
  ),
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const emptyStat = (muscle: MuscleId): MuscleLoadStat => ({
  muscle,
  score: 0,
  lastWorkedAt: null,
  contributors: [],
});

function result(overrides: Partial<MuscleLoadResult> = {}): MuscleLoadResult {
  return {
    catalogAvailable: true,
    windowDays: 7,
    halfLifeDays: 2,
    saturationScore: 8,
    muscles: MUSCLES.map(emptyStat),
    coverage: {
      recentExercises: 0,
      recentSets: 0,
      matchedExercises: 0,
      matchedSets: 0,
      unmatchedExercises: 0,
      unmatchedSets: 0,
    },
    ...overrides,
  };
}

function withStats(base: MuscleLoadResult, stats: MuscleLoadStat[]): MuscleLoadResult {
  const byMuscle = new Map(stats.map((stat) => [stat.muscle, stat]));
  return { ...base, muscles: MUSCLES.map((muscle) => byMuscle.get(muscle) ?? emptyStat(muscle)) };
}

afterEach(() => {
  cleanup();
});

describe('MuscleLoadMap', () => {
  it('renders the empty map details and no-contributor guidance', async () => {
    const { MuscleLoadMap } = await import('../../src/ui/muscle-load-map');
    render(<MuscleLoadMap result={result()} />);

    assert.ok(screen.getByLabelText(/Selected muscle: Chest\. 0 percent\. Not worked recently/));
    assert.ok(screen.getByLabelText(/Muscle load legend/));
    assert.ok(screen.getByText('No mapped load in the past 7 days. The map stays blue until a catalog-matched set with recorded work is logged.'));
    assert.ok(screen.getByText('No mapped exercises contributed to this muscle in the current window.'));
    assert.ok(screen.getByText('0%', { exact: true }));
    assert.ok(screen.getByText('Not worked in this window', { exact: true }));
    assert.equal(screen.queryByText('Top contributors', { exact: true }), null);
  });

  it('renders populated load details, contributor rows, and partial-mapping coverage', async () => {
    const now = Date.now();
    const populated = withStats(result({
      coverage: {
        recentExercises: 2,
        recentSets: 3,
        matchedExercises: 1,
        matchedSets: 2,
        unmatchedExercises: 1,
        unmatchedSets: 1,
      },
    }), [
      {
        muscle: 'chest',
        score: 4,
        lastWorkedAt: now - 2 * 24 * 60 * 60 * 1000,
        contributors: [
          { exerciseId: 'bench', variationId: null, label: 'Bench Press', score: 3 },
          { exerciseId: 'push-up', variationId: null, label: 'Push Up', score: 1 },
        ],
      },
    ]);
    const { MuscleLoadMap } = await import('../../src/ui/muscle-load-map');
    render(<MuscleLoadMap result={populated} />);

    assert.ok(screen.getByLabelText('Chest. 50 percent. Moderate recent load. Last worked 2 days ago. Top exercises: Bench Press, Push Up.'));
    assert.ok(screen.getByText('50%', { exact: true }));
    assert.ok(screen.getByText('2 days ago', { exact: true }));
    assert.ok(screen.getByText('Top contributors', { exact: true }));
    assert.ok(screen.getByText('Bench Press', { exact: true }));
    assert.ok(screen.getByText('Push Up', { exact: true }));
    assert.ok(screen.getByText('1 of 2 recent exercises could not be mapped and was excluded.', { exact: true }));
    assert.equal(screen.queryByText('No mapped load in the past 7 days.', { exact: false }), null);
  });

  it('updates the selected details when the map selects another muscle', async () => {
    const populated = withStats(result(), [
      {
        muscle: 'triceps',
        score: 8,
        lastWorkedAt: Date.now(),
        contributors: [
          { exerciseId: 'pressdown', variationId: null, label: 'Pressdown', score: 8 },
        ],
      },
    ]);
    const { MuscleLoadMap } = await import('../../src/ui/muscle-load-map');
    render(<MuscleLoadMap result={populated} />);

    fireEvent.click(screen.getByRole('button', { name: /Selected muscle: Chest/ }));

    assert.ok(screen.getByLabelText('Triceps. 100 percent. Heavy recent load. Last worked Today. Top exercises: Pressdown.'));
    assert.ok(screen.getAllByText('100%', { exact: true }).length >= 1);
    assert.ok(screen.getByText('Pressdown', { exact: true }));
    assert.ok(screen.getByText('Today', { exact: true }));
    assert.equal(screen.queryByText('No mapped exercises contributed to this muscle in the current window.'), null);
  });
});
