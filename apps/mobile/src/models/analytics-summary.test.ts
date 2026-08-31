import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { makePerformedExercise, makeWorkout } from '@/tests/factories';
import { computeAnalyticsSummary } from './analytics-summary';

describe('computeAnalyticsSummary', () => {
  it('summarizes factory workouts', () => {
    const workouts = [
      makeWorkout({
        id: 'workout-1',
        date: '2026-08-20T12:00:00.000Z',
        performedExercises: [makePerformedExercise({
          exerciseNameSnapshot: 'Bench Press',
          sets: [{ setNumber: 1, reps: 8, weight: 100, bodyweight: false }],
        })],
      }),
      makeWorkout({
        id: 'workout-2',
        date: '2026-08-21T12:00:00.000Z',
        performedExercises: [makePerformedExercise({
          exerciseNameSnapshot: 'Bench Press',
          sets: [{ setNumber: 1, reps: 5, weight: 110, bodyweight: false }],
        })],
      }),
    ];

    const summary = computeAnalyticsSummary(workouts);
    assert.equal(summary.favoriteExercise, 'Bench Press');
    assert.equal(summary.maxWeights['Bench Press'], 110);
    assert.deepEqual(summary.eligibleStrengthExercises, ['Bench Press']);
  });

  it('returns the empty summary for no workouts', () => {
    const summary = computeAnalyticsSummary([]);
    assert.equal(summary.favoriteExercise, null);
    assert.deepEqual(summary.maxWeights, {});
    assert.deepEqual(summary.eligibleStrengthExercises, []);
  });
});
