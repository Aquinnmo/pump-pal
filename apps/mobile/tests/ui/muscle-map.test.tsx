import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';
import type { MuscleId } from '@/constants/muscles';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
let nextTap = { locationX: 0, locationY: 0 };

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    name === 'checkmark' ? <span aria-label="selected option" /> : null,
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// Keep native-only dependencies at their seams while rendering the map and
// dropdown's user-visible DOM through the normal mobile web harness.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'muscle-map-native-test-doubles',
  setup(build: Build) {
    const reactNativeWeb = require('react-native-web') as Record<string, unknown>;
    build.module('react-native', () => ({
      exports: {
        ...reactNativeWeb,
        useWindowDimensions: () => ({ width: 632, height: 800, scale: 1, fontScale: 1 }),
        Pressable: ({
          accessibilityLabel,
          accessibilityRole,
          children,
          onPress,
          ...props
        }: {
          accessibilityLabel?: string;
          accessibilityRole?: string;
          children?: ReactNode;
          onPress?: (event: { nativeEvent: typeof nextTap }) => void;
          [key: string]: unknown;
        }) => (
          <button
            {...props}
            aria-label={accessibilityLabel}
            role={accessibilityRole}
            type="button"
            onClick={() => onPress?.({ nativeEvent: nextTap })}
          >
            {children}
          </button>
        ),
      },
      loader: 'object',
    }));
    build.module('react-native-svg', () => ({
      exports: {
        default: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
          <svg {...props}>{children}</svg>
        ),
        G: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
          <g {...props}>{children}</g>
        ),
        Path: (props: Record<string, unknown>) => <path {...props} />,
      },
      loader: 'object',
    }));
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

const { MuscleMap } = await import('../../src/ui/muscle-map');

afterEach(() => {
  cleanup();
});

function renderMap(selectedMuscle: MuscleId = 'chest', onSelectMuscle: (muscle: MuscleId) => void = () => undefined) {
  return render(
    <MuscleMap
      accessibilityLabel="Muscle map"
      colorForScore={() => '#f59e0b'}
      dropdownAccessibilityLabel="Choose muscle"
      onSelectMuscle={onSelectMuscle}
      scores={new Map([['chest', 80] as const])}
      selectedMuscle={selectedMuscle}
    />,
  );
}

describe('MuscleMap', () => {
  it('exposes the map views and interactive controls accessibly', () => {
    renderMap();

    assert.ok(screen.getByText('Anterior', { exact: true }));
    assert.ok(screen.getByText('Posterior', { exact: true }));
    assert.ok(screen.getByRole('button', { name: 'Muscle map Tap a muscle to select it.' }));
    assert.ok(screen.getByRole('button', { name: 'Choose muscle' }));
    assert.ok(screen.getByText('Chest', { exact: true }));
  });

  it('does not crash when a persisted unknown muscle id is selected', () => {
    assert.doesNotThrow(() => renderMap('unknown muscle' as MuscleId));

    assert.ok(screen.getByText('Unknown Muscle', { exact: true }));
    assert.ok(screen.getByRole('button', { name: 'Muscle map Tap a muscle to select it.' }));
  });

  it('selects a mapped tap but ignores off-body and neutral taps', () => {
    const selected: MuscleId[] = [];
    renderMap('chest', (muscle) => selected.push(muscle));
    const map = screen.getByRole('button', { name: 'Muscle map Tap a muscle to select it.' });

    // Chest's stable anterior hit center in the map viewbox (72, 126).
    nextTap = { locationX: (72 / 360) * 560, locationY: (126 / 448) * ((560 * 448) / 360) };
    fireEvent.click(map);
    // The origin is outside the body and must not select a muscle.
    nextTap = { locationX: 0, locationY: 0 };
    fireEvent.click(map);
    // The anterior head is a neutral, non-muscle tile.
    nextTap = { locationX: (90 / 360) * 560, locationY: (29 / 448) * ((560 * 448) / 360) };
    fireEvent.click(map);

    assert.deepEqual(selected, ['chest']);
  });
});
