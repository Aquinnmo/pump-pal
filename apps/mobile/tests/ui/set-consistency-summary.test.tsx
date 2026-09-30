import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import { makePerformedExercise, makeWorkout } from '../factories';
import { SetConsistencySummary } from '../../src/ui/set-consistency-summary';

afterEach(() => {
  cleanup();
});

function multiSetWorkout(
  id: string,
  date: string,
  sets: Array<{ reps: number; weight: number }>,
) {
  return makeWorkout({
    id,
    date: new Date(date),
    performedExercises: [
      makePerformedExercise({
        sets: sets.map((set, index) => ({
          setNumber: index + 1,
          ...set,
          completed: true,
        })),
      }),
    ],
  });
}

describe('SetConsistencySummary', () => {
  it('renders user-legible empty guidance when no workouts are eligible', () => {
    render(<SetConsistencySummary workouts={[]} />);

    const summary = screen.getByLabelText(
      'Set consistency. Not enough data. Log more multi-set exercises to reveal how your weight and reps change.',
    );
    assert.equal(summary.textContent, 'Set consistencyNot enough dataLog more multi-set exercises to reveal how your weight and reps change.');
  });

  it('treats undated workouts as unavailable data and preserves the empty guidance', () => {
    render(
      <SetConsistencySummary
        workouts={[
          makeWorkout({ date: undefined, performedExercises: [] }),
        ]}
      />,
    );

    assert.ok(
      screen.getByText(
        'Log more multi-set exercises to reveal how your weight and reps change.',
      ),
    );
    assert.equal(screen.queryByText('Loading'), null);
    assert.equal(screen.queryByText('Error'), null);
  });

  it('renders the populated consistency result and its distribution accessibly', () => {
    render(
      <SetConsistencySummary
        workouts={[
          multiSetWorkout('workout-1', '2025-01-03T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
          ]),
          multiSetWorkout('workout-2', '2025-01-02T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
          ]),
          multiSetWorkout('workout-3', '2025-01-01T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
          ]),
        ]}
      />,
    );

    const summary = screen.getByLabelText(
      'Set consistency. Consistent. Across 9 set-to-set changes in your last 3 workouts, you stayed consistent. By set change: 0 overconfident, 0 hitting failure, 9 consistent, 0 holding back, 0 underconfident.',
    );
    assert.ok(screen.getByText('Consistent'));
    assert.match(
      summary.getAttribute('aria-label') ?? '',
      /Across 9 set-to-set changes in your last 3 workouts, you stayed consistent\./,
    );
  });

  it('names the dominant kind of change when sets are not steady', () => {
    render(
      <SetConsistencySummary
        workouts={[
          multiSetWorkout('workout-1', '2025-01-02T00:00:00.000Z', [
            { reps: 8, weight: 100 },
            { reps: 8, weight: 70 },
            { reps: 8, weight: 45 },
            { reps: 8, weight: 25 },
          ]),
          multiSetWorkout('workout-2', '2025-01-01T00:00:00.000Z', [
            { reps: 8, weight: 100 },
            { reps: 8, weight: 70 },
            { reps: 8, weight: 45 },
            { reps: 8, weight: 25 },
          ]),
        ]}
      />,
    );

    assert.ok(screen.getByText('Overconfident'));
    assert.equal(screen.queryByText(/went both ways/), null);
  });
});
