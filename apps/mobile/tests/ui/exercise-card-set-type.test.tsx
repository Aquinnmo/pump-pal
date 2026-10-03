import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

const haptics: string[] = [];
type SwipeableProps = {
  children?: ReactNode;
  onSwipeableWillOpen?: (direction: 'left' | 'right') => void;
  onSwipeableOpen?: (direction: 'left' | 'right') => void;
  renderLeftActions?: () => ReactNode;
  renderRightActions?: () => ReactNode;
};
// Renders the row plus one button per swipe direction that has actions, standing in for
// the gesture. RNGH's direction is the swipe's: 'right' reveals the left (complete) panel.
// A committed swipe fires WillOpen on release, then Open once the row has settled.
const Swipeable = ({ children, onSwipeableWillOpen, onSwipeableOpen, renderLeftActions, renderRightActions }: SwipeableProps) => {
  const swipe = (direction: 'left' | 'right') => {
    onSwipeableWillOpen?.(direction);
    onSwipeableOpen?.(direction);
  };
  return (
    <div>
      {children}
      {renderLeftActions && <button aria-label="swipe right" onClick={() => swipe('right')} />}
      {renderRightActions && <button aria-label="swipe left" onClick={() => swipe('left')} />}
    </div>
  );
};

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
    build.module('react-native-gesture-handler/ReanimatedSwipeable', () => ({
      exports: { default: Swipeable, SwipeDirection: { LEFT: 'left', RIGHT: 'right' } },
      loader: 'object',
    }));
    build.module('expo-haptics', () => ({
      exports: {
        ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
        impactAsync: (style: string) => void haptics.push(style),
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
        withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
          callback?.(true);
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

function renderCard(sets: DraftSet[], calls: Calls = {}, showCompletion = false) {
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
      onToggleSetComplete={record('toggleComplete')}
      showCompletion={showCompletion}
    />
  );
  return calls;
}

afterEach(() => {
  cleanup();
  haptics.length = 0;
});

describe('ExerciseCard set types', () => {
  it('offers Drop set on the first set', () => {
    const calls = renderCard([set]);
    fireEvent.click(screen.getByLabelText('Set 1 options'));
    fireEvent.click(screen.getByText('Drop set', { exact: true }));
    assert.deepEqual(calls.type, [[0, 0, 'drop']]);
    // A lone set can't be removed or completed from the planner menu.
    assert.equal(screen.queryByText('Remove set', { exact: true }), null);
    assert.equal(screen.queryByText('Complete set', { exact: true }), null);
  });

  it('renders a drop set as one set with its drops inside it', () => {
    const drop = { reps: 6, weight: '150', durationMinutes: 0, durationSeconds: 0 };
    const calls = renderCard([{ ...set, type: 'drop', subSets: [drop, { ...drop, weight: '120' }] }]);
    // Labels show once, on the top row; the drops' inputs stack under them unlabeled.
    assert.equal(screen.getAllByText('Reps', { exact: true }).length, 1);
    assert.equal(screen.getAllByText('Weight (lbs)', { exact: true }).length, 1);
    // One options menu for the whole set, and every part's weight is editable.
    assert.equal(screen.getAllByLabelText('Set 1 options').length, 1);
    assert.deepEqual(screen.getAllByDisplayValue(/^(185|150|120)$/).map((el) => (el as HTMLInputElement).value), ['185', '150', '120']);

    fireEvent.change(screen.getByDisplayValue('150'), { target: { value: '145' } });
    fireEvent.click(screen.getByText('Add drop', { exact: true }));
    // Drops are removed by swiping them; the drop rows carry no menu of their own.
    fireEvent.click(screen.getAllByLabelText('swipe left')[1]);
    assert.deepEqual(calls.update, [[0, 0, 'weight', '145', 1]]);
    assert.deepEqual(calls.addSubSet, [[0, 0]]);
    assert.deepEqual(calls.removeSubSet, [[0, 0, 2]]);
    // A lone set can't be deleted, but its drops can.
    assert.equal(screen.getAllByLabelText('swipe left').length, 2);
    assert.deepEqual(haptics, ['medium']);
  });

  it('removes a set from its menu and by swiping left', () => {
    const calls = renderCard([set, set]);
    fireEvent.click(screen.getAllByLabelText('Set 2 options')[0]);
    fireEvent.click(screen.getByText('Remove set', { exact: true }));
    fireEvent.click(screen.getAllByLabelText('swipe left')[0]);
    assert.deepEqual(calls.removeSet, [[0, 1], [0, 0]]);
    assert.deepEqual(haptics, ['medium', 'medium']);
    // No completion in the planner, so no swipe right.
    assert.equal(screen.queryByLabelText('swipe right'), null);
  });

  it('completes a set by swiping right', () => {
    const calls = renderCard([set, { ...set, completed: true }], {}, true);
    fireEvent.click(screen.getAllByLabelText('swipe right')[0]);
    fireEvent.click(screen.getAllByLabelText('swipe right')[1]);
    assert.deepEqual(calls.toggleComplete, [[0, 0, 0], [0, 1, 0]]);
    // Light feedback only when a set becomes complete, not when it is reopened.
    assert.deepEqual(haptics, ['light']);
  });

  it('completes every incomplete part of a drop set from the menu', () => {
    const drop = { reps: 6, weight: '150', durationMinutes: 0, durationSeconds: 0 };
    const calls = renderCard([{ ...set, type: 'drop', subSets: [{ ...drop, completed: true }, drop] }], {}, true);
    fireEvent.click(screen.getByLabelText('Set 1 options'));
    fireEvent.click(screen.getByText('Complete set', { exact: true }));
    assert.deepEqual(calls.toggleComplete, [[0, 0, 0], [0, 0, 2]]);
    assert.deepEqual(haptics, ['light']);
  });

  it('offers to reopen a drop set once every part is complete', () => {
    const drop = { reps: 6, weight: '150', durationMinutes: 0, durationSeconds: 0, completed: true };
    const calls = renderCard([{ ...set, type: 'drop', completed: true, subSets: [drop, drop] }], {}, true);
    fireEvent.click(screen.getByLabelText('Set 1 options'));
    assert.equal(screen.queryByText('Complete set', { exact: true }), null);
    fireEvent.click(screen.getByText('Mark set incomplete', { exact: true }));
    assert.deepEqual(calls.toggleComplete, [[0, 0, 0], [0, 0, 1], [0, 0, 2]]);
    assert.deepEqual(haptics, []);
  });
});
