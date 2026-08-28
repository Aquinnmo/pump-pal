import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { ExerciseRef, ExerciseSearchOption } from '@/types/workout';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    name === 'checkmark' ? <span aria-label="selected option" /> : null,
}));

// ExercisePicker's sheet animation and gesture boundaries are native-only. Keep
// those boundaries as synchronous DOM doubles while rendering the real picker.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'exercise-picker-test-doubles',
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

const { ExercisePicker } = await import('../../src/ui/primitives/exercise-picker');

const option = (overrides: Partial<ExerciseSearchOption> = {}): ExerciseSearchOption => ({
  label: 'Bench Press',
  exerciseId: 'bench-press',
  variationId: null,
  tokens: ['bench', 'press'],
  aliases: [],
  primaryMuscles: ['chest'],
  equipment: ['barbell'],
  ...overrides,
});

const recent = (overrides: Partial<ExerciseRef> = {}): ExerciseRef => ({
  exerciseId: 'push-up',
  variationId: null,
  label: 'Push-Up',
  ...overrides,
});

afterEach(() => {
  cleanup();
});

function openPicker(label = 'Select exercise'): void {
  fireEvent.click(screen.getByText(label, { exact: true }));
}

describe('ExercisePicker', () => {
  it('shows recents before search when recent exercises are available', () => {
    render(
      <ExercisePicker
        options={[option(), option({ label: 'Push-Up', exerciseId: 'push-up', tokens: ['push', 'up'] })]}
        recentExercises={[recent()]}
        onSelect={() => undefined}
        value={null}
      />,
    );

    openPicker();

    assert.ok(screen.getByText('Push-Up', { exact: true }));
    assert.ok(screen.getByText('Other / Search all exercises', { exact: true }));
    assert.equal(screen.queryByPlaceholderText('Search exercises'), null);

    fireEvent.click(screen.getByText('Other / Search all exercises', { exact: true }));

    assert.ok(screen.getByPlaceholderText('Search exercises'));
  });

  it('selects a recent exercise exactly once with its full reference', () => {
    const selections: ExerciseRef[] = [];
    const selected = recent({ exerciseId: 'push-up', variationId: 'diamond', label: 'Push-Up' });
    render(
      <ExercisePicker
        options={[option()]}
        recentExercises={[selected]}
        onSelect={(value) => selections.push(value)}
        value={null}
      />,
    );

    openPicker();
    fireEvent.click(screen.getByText('Push-Up', { exact: true }));

    assert.deepEqual(selections, [selected]);
  });

  it('uses the under-review sentinel when creating without an onCreateNew handler', () => {
    const selections: ExerciseRef[] = [];
    render(
      <ExercisePicker
        options={[]}
        onSelect={(value) => selections.push(value)}
        value={null}
      />,
    );

    openPicker();
    const search = screen.getByPlaceholderText('Search exercises');
    fireEvent.change(search, { target: { value: '  Cable Chop  ' } });
    fireEvent.click(screen.getByText('Use "Cable Chop" as new exercise', { exact: true }));

    assert.deepEqual(selections, [{
      exerciseId: 'under-review',
      variationId: 'ur_cable-chop',
      label: 'Cable Chop',
    }]);
  });

  it('selects a catalog search result exactly once with its exercise reference', () => {
    const selections: ExerciseRef[] = [];
    const searched = option({
      label: 'Cable Row',
      exerciseId: 'cable-row',
      tokens: ['cable', 'row'],
      equipment: ['cable'],
    });
    render(
      <ExercisePicker
        options={[searched]}
        onSelect={(value) => selections.push(value)}
        value={null}
      />,
    );

    openPicker();
    fireEvent.change(screen.getByPlaceholderText('Search exercises'), { target: { value: 'Cable' } });
    fireEvent.click(screen.getByText('Cable Row', { exact: true }));

    assert.deepEqual(selections, [{
      exerciseId: 'cable-row',
      variationId: null,
      label: 'Cable Row',
    }]);
  });

  it('marks every duplicate label as selected by the current label value', () => {
    render(
      <ExercisePicker
        options={[
          option({ exerciseId: 'bench-press', variationId: null }),
          option({ exerciseId: 'bench-press', variationId: 'close-grip', label: 'Bench Press' }),
        ]}
        onSelect={() => undefined}
        value="Bench Press"
      />,
    );

    openPicker('Bench Press');

    assert.equal(screen.getAllByLabelText('selected option').length, 2);
  });
});
