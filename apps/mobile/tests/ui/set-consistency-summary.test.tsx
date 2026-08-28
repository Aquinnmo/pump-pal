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
      'Set consistency. Not enough data. Log 3 more multi-set exercises to reveal how your weight and reps change.',
    );
    assert.equal(summary.textContent, 'Set consistencyNot enough dataLog 3 more multi-set exercises to reveal how your weight and reps change.');
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
        'Log 3 more multi-set exercises to reveal how your weight and reps change.',
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
          ]),
          multiSetWorkout('workout-2', '2025-01-02T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
          ]),
          multiSetWorkout('workout-3', '2025-01-01T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 20 },
          ]),
        ]}
      />,
    );

    const summary = screen.getByLabelText(
      'Set consistency. Consistent. Across 3 multi-set exercises in your last 3 workouts, you stayed consistent. By exercise: 0 big drops, 0 eased off, 3 held steady, 0 crept up, 0 big jumps.',
    );
    assert.ok(screen.getByText('Consistent'));
    assert.match(
      summary.getAttribute('aria-label') ?? '',
      /Across 3 multi-set exercises in your last 3 workouts, you stayed consistent\./,
    );
    assert.match(summary.textContent ?? '', /Held/);
  });

  it('renders the erratic category and its both-ways note', () => {
    render(
      <SetConsistencySummary
        workouts={[
          multiSetWorkout('workout-1', '2025-01-03T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 40 },
            { reps: 8, weight: 20 },
          ]),
          multiSetWorkout('workout-2', '2025-01-02T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 40 },
            { reps: 8, weight: 20 },
          ]),
          multiSetWorkout('workout-3', '2025-01-01T00:00:00.000Z', [
            { reps: 8, weight: 20 },
            { reps: 8, weight: 40 },
            { reps: 8, weight: 20 },
          ]),
        ]}
      />,
    );

    assert.ok(screen.getByText('Erratic'));
    assert.ok(screen.getByText('3 exercises went both ways.'));
  });
});
