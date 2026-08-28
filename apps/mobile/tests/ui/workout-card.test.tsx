import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import { makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { Workout } from '@/types/workout';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// Keep native gesture and animation surfaces at the module boundary while the
// card's visible content and interactions remain real.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'workout-card-test-doubles',
  setup(build: Build) {
    const gesture = {
      onEnd: () => gesture,
      onUpdate: () => gesture,
    };
    build.module('react-native-gesture-handler', () => ({
      exports: {
        Gesture: { Pan: () => gesture },
        GestureDetector: passthrough,
        GestureHandlerRootView: passthrough,
      },
      loader: 'object',
    }));
    build.module('react-native-reanimated', () => ({
      exports: {
        default: { View: passthrough },
        runOnJS: (callback: () => void) => callback,
        useAnimatedStyle: (factory: () => unknown) => factory(),
        useSharedValue: (value: number) => ({ value }),
        withSpring: (value: number) => value,
        withTiming: (value: number, _config: unknown, callback?: () => void) => {
          callback?.();
          return value;
        },
      },
      loader: 'object',
    }));
  },
});

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

const { WorkoutCard } = await import('../../src/ui/workout-card');

afterEach(() => {
  cleanup();
});

function populatedWorkout(): Workout {
  return makeWorkout({
    id: 'workout-42',
    name: 'Pull Day',
    date: new Date('2026-08-20T12:00:00.000Z'),
    notes: 'Felt strong',
    performedExercises: [
      makePerformedExercise({
        exerciseId: 'barbell-row',
        exerciseNameSnapshot: 'Barbell Row',
        sets: [{ setNumber: 1, reps: 5, weight: 100, completed: true }],
      }),
    ],
  });
}

describe('WorkoutCard', () => {
  it('renders the empty card baseline without exercise metrics', () => {
    render(
      <WorkoutCard
        workout={makeWorkout({ name: 'Empty Session', date: undefined, performedExercises: [] })}
      />,
    );

    assert.ok(screen.getByText('Empty Session', { exact: true }));
    assert.ok(screen.getByText('Date unavailable', { exact: true }));
    assert.ok(screen.getByText('View', { exact: true }));
    assert.ok(screen.getByText('Share', { exact: true }));
    assert.equal(screen.queryByText('Exercises', { exact: true }), null);
    assert.equal(screen.queryByText('Volume', { exact: true }), null);
  });

  it('renders populated exercise metrics and details through the primary View action', () => {
    render(<WorkoutCard workout={populatedWorkout()} />);

    assert.ok(screen.getByText('Pull Day', { exact: true }));
    assert.ok(screen.getByText('Volume', { exact: true }));
    assert.ok(screen.getByText('500 lbs', { exact: true }));
    assert.ok(screen.getByText('Total Reps', { exact: true }));
    assert.ok(screen.getByText('5', { exact: true }));
    assert.ok(screen.getByText('Exercise', { exact: true }));
    assert.ok(screen.getByText('1', { exact: true }));

    fireEvent.click(screen.getByText('View', { exact: true }));

    assert.ok(screen.getByText('Barbell Row', { exact: true }));
    assert.ok(screen.getByText('5 reps @ 100 lbs', { exact: true }));
    assert.ok(screen.getByText('Notes', { exact: true }));
    assert.ok(screen.getByText('Felt strong', { exact: true }));
  });

  it('shows a user-visible empty state when viewing a zero-exercise workout', () => {
    render(
      <WorkoutCard
        workout={makeWorkout({ name: 'No Lift Session', performedExercises: [] })}
      />,
    );

    fireEvent.click(screen.getByText('View', { exact: true }));

    assert.ok(screen.getByText('No exercises logged.', { exact: true }));
  });

  it('passes the full workout to the optional Edit interaction exactly once', () => {
    const workout = populatedWorkout();
    const edits: Workout[] = [];
    render(<WorkoutCard workout={workout} onEdit={(value) => edits.push(value)} />);

    fireEvent.click(screen.getByText('Edit', { exact: true }));

    assert.deepEqual(edits, [workout]);
  });
});
