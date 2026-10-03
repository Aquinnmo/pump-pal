import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    name === 'checkmark' ? <span aria-label="selected option" /> : null,
}));

// Package-level mocks do not override the installed native packages after the
// mobile preload resolver runs, so register these native-only boundaries with
// Bun's module plugin before importing the component.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'exercise-card-native-test-doubles',
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

mock.module('@/ui/primitives/drag-handle', () => ({ DragHandle: () => null }));
mock.module('@/ui/primitives/exercise-picker', () => ({ ExercisePicker: () => null }));

const { ExerciseCard } = await import('../../src/ui/workout/exercise-card');
type DraftSet = import('../../src/types/workout').DraftSet;

const set = { reps: 8, weight: '185', durationMinutes: 0, durationSeconds: 0 };
const noop = () => undefined;
type Calls = Record<string, unknown[][]>;

function renderCard(sets: DraftSet[], calls: Calls = {}) {
  const record = (name: string) => (...args: unknown[]) => void (calls[name] ??= []).push(args);
  render(
    <ExerciseCard
      exercise={{ uid: 'a', exerciseId: 'bench', variationId: null, label: 'Bench', exerciseType: 'Sets of Reps', bodyweight: false, sets }}
      index={0}
      catalogOptions={[]}
      onSelectExercise={noop}
      onChangeType={noop}
      onToggleBodyweight={noop}
      onRemoveExercise={noop}
      onUpdateSet={record('update')}
      onIncrementSet={noop}
      onDecrementSet={noop}
      onAddSet={noop}
      onRemoveSet={record('removeSet')}
      onChangeSetType={record('type')}
      onAddSubSet={record('addSubSet')}
      onRemoveSubSet={record('removeSubSet')}
    />
  );
  return calls;
}

afterEach(() => cleanup());

describe('ExerciseCard set types', () => {
  it('offers Drop set on the first set', () => {
    const calls = renderCard([set]);
    fireEvent.click(screen.getByLabelText('Set 1, Simple set. Change set type'));
    fireEvent.click(screen.getByText('Drop set', { exact: true }));
    assert.deepEqual(calls.type, [[0, 0, 'drop']]);
  });

  it('renders a drop set as one set with its drops inside it', () => {
    const drop = { reps: 6, weight: '150', durationMinutes: 0, durationSeconds: 0 };
    const calls = renderCard([{ ...set, type: 'drop', subSets: [drop, { ...drop, weight: '120' }] }]);
    // Labels show once, on the top row; the drops' inputs stack under them unlabeled.
    assert.equal(screen.getAllByText('Reps', { exact: true }).length, 1);
    assert.equal(screen.getAllByText('Weight (lbs)', { exact: true }).length, 1);
    // One badge for the whole set, and every part's weight is editable.
    assert.ok(screen.getByLabelText('Set 1, Drop set. Change set type'));
    assert.deepEqual(screen.getAllByDisplayValue(/^(185|150|120)$/).map((el) => (el as HTMLInputElement).value), ['185', '150', '120']);

    fireEvent.change(screen.getByDisplayValue('150'), { target: { value: '145' } });
    fireEvent.click(screen.getByText('Add drop', { exact: true }));
    fireEvent.click(screen.getByLabelText('Remove drop 3'));
    assert.deepEqual(calls.update, [[0, 0, 'weight', '145', 1]]);
    assert.deepEqual(calls.addSubSet, [[0, 0]]);
    assert.deepEqual(calls.removeSubSet, [[0, 0, 2]]);
    // A lone set can't be deleted, but its drops can.
    assert.equal(screen.queryByLabelText('Remove set 1'), null);
  });
});
