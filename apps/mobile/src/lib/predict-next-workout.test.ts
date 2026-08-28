import assert from 'node:assert/strict';
import type { Workout } from '@/types/workout';
import { predictNextWorkoutName, predictWorkoutAfterName } from './predict-next-workout';

function workout(name: string, date?: string, status?: Workout['status']): Workout {
  return {
    id: `${name}-${date ?? 'no-date'}`,
    userId: 'user-1',
    name,
    ...(date === undefined ? {} : { date }),
    ...(status === undefined ? {} : { status }),
    performedExercises: [],
    schemaVersion: 2,
  };
}

const split = ['Push', 'Pull', 'Legs'];

// Empty and singleton splits are deliberate fast paths: no history is needed
// to answer either case.
assert.equal(predictNextWorkoutName([], []), null);
assert.equal(predictNextWorkoutName(['Full Body'], []), 'Full Body');

// Only completed (or legacy status-less) dated workouts in the split can teach
// a transition. The input order is intentionally not chronological.
{
  const history = [
    workout('Pull', '2026-01-02T12:00:00.000Z'),
    workout('Push', '2026-01-01T12:00:00.000Z'),
    workout('Legs', '2026-01-03T12:00:00.000Z'),
    workout('Push', '2026-01-04T12:00:00.000Z', 'planned'),
    workout('Pull', undefined),
    workout('Push', 'not-a-date'),
  ];

  assert.equal(
    predictWorkoutAfterName(split, history, 'Push'),
    'Pull',
    'history is sorted ascending and planned/undated/invalid rows are ignored',
  );
}

// The scan starts before the newest item. A back-to-back repeat is not a
// signal, so it keeps scanning for the prior useful transition.
{
  const history = [
    workout('Push', '2026-02-01T12:00:00.000Z'),
    workout('Push', '2026-02-02T12:00:00.000Z'),
    workout('Pull', '2026-02-03T12:00:00.000Z'),
    workout('Push', '2026-02-04T12:00:00.000Z'),
    workout('Push', '2026-02-05T12:00:00.000Z'),
  ];

  assert.equal(
    predictWorkoutAfterName(split, history, 'Push'),
    'Pull',
    'back-to-back anchor occurrences do not hide an earlier transition',
  );
}

// With no learned transition, the prediction is the next item in split order;
// an unknown anchor uses the first split item as the safe fallback.
assert.equal(predictWorkoutAfterName(split, [], 'Pull'), 'Legs');
assert.equal(predictWorkoutAfterName(split, [], 'Unknown'), 'Push');
assert.equal(predictWorkoutAfterName(split, [], null), 'Push');

// The convenience export uses the latest chronological split workout as its
// anchor, then applies the same transition rules.
assert.equal(
  predictNextWorkoutName(split, [
    workout('Push', '2026-03-01T12:00:00.000Z'),
    workout('Pull', '2026-03-02T12:00:00.000Z'),
  ]),
  'Legs',
  'a latest workout with no prior same-name transition falls back round-robin',
);

console.log('predict-next-workout: all assertions passed');
