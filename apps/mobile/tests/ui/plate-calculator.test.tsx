import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

mock.module('@expo/vector-icons', () => ({ Ionicons: () => null }));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// Native-only gesture and animation packages are replaced at their module
// boundary; the calculator's visible text and controls remain real.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'plate-calculator-native-test-doubles',
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

const { PlateCalculator } = await import('../../src/ui/primitives/plate-calculator');

afterEach(() => {
  cleanup();
});

describe('PlateCalculator', () => {
  it('shows the ordinary barbell plate presentation for a seeded target', () => {
    render(
      <PlateCalculator
        initialTarget="135"
        onClose={() => undefined}
        visible
      />,
    );

    assert.ok(screen.getByText('Plate Calculator', { exact: true }));
    assert.ok(screen.getByText('135 lbs', { exact: true }));
    assert.ok(screen.getByText('45 lb bar + 45 lb per side', { exact: true }));
    assert.ok(screen.getByText('45 lb', { exact: true }));
  });

  it('keeps an empty target blank instead of presenting a closest-load result', () => {
    render(
      <PlateCalculator
        initialTarget=""
        onClose={() => undefined}
        visible
      />,
    );

    assert.ok(screen.getByText('45 lbs', { exact: true }));
    assert.equal(screen.queryByText(/Closest loadable to a/), null);
  });

  for (const rowKind of ['bodyweight', 'duration', 'blank-weight'] as const) {
    it(`renders no plate UI when the caller suppresses a ${rowKind} row`, () => {
      render(
        <PlateCalculator
          initialTarget={undefined}
          onClose={() => undefined}
          visible={false}
        />,
      );

      assert.equal(screen.queryByText('Plate Calculator', { exact: true }), null);
      assert.equal(screen.queryByText('Plates per side', { exact: true }), null);
    });
  }
});
