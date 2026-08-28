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
  name: 'dropdown-native-test-doubles',
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

const { Dropdown } = await import('../../src/ui/primitives/dropdown');

afterEach(() => {
  cleanup();
});

function openDropdown(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Choose workout' }));
}

describe('Dropdown', () => {
  it('starts closed and opens to expose its options as radio choices', () => {
    render(
      <Dropdown
        accessibilityLabel="Choose workout"
        onSelect={() => undefined}
        options={['Push', 'Pull']}
        placeholder="Choose workout"
        value={null}
      />,
    );

    assert.ok(screen.getByRole('button', { name: 'Choose workout' }));
    assert.equal(screen.queryByRole('radio', { name: 'Push' }), null);

    openDropdown();
    assert.ok(screen.getByRole('radio', { name: 'Push' }));
    assert.ok(screen.getByRole('radio', { name: 'Pull' }));
  });

  it('selects exactly once with the chosen value', () => {
    const selected: string[] = [];
    render(
      <Dropdown
        accessibilityLabel="Choose workout"
        onSelect={(value) => selected.push(value)}
        options={['Push', 'Pull']}
        placeholder="Choose workout"
        value={null}
      />,
    );

    openDropdown();
    fireEvent.click(screen.getByRole('radio', { name: 'Pull' }));

    assert.deepEqual(selected, ['Pull']);
  });

  it('dismisses without selecting when the close action is pressed', () => {
    const selected: string[] = [];
    render(
      <Dropdown
        accessibilityLabel="Choose workout"
        onSelect={(value) => selected.push(value)}
        options={['Push', 'Pull']}
        placeholder="Choose workout"
        value={null}
      />,
    );

    openDropdown();
    fireEvent.click(screen.getAllByRole('presentation')[0]);

    assert.deepEqual(selected, []);
  });

  it('keeps duplicate option rows independently visible and selected by label equality', () => {
    render(
      <Dropdown
        accessibilityLabel="Choose workout"
        onSelect={() => undefined}
        options={['Push', 'Push']}
        placeholder="Choose workout"
        value="Push"
      />,
    );

    openDropdown();
    const duplicateRows = screen.getAllByRole('radio');
    assert.equal(duplicateRows.length, 2);
    assert.equal(screen.getAllByLabelText('selected option').length, 2);
  });
});
