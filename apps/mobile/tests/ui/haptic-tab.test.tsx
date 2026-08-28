import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const hapticCalls: unknown[] = [];

// Keep the platform feedback boundary observable while exercising the real
// HapticTab and react-native-web Pressable implementation.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'haptic-tab-test-doubles',
  setup(build: Build) {
    build.module('expo-haptics', () => ({
      exports: {
        ImpactFeedbackStyle: { Light: 'light' },
        impactAsync: (style: unknown) => {
          hapticCalls.push(style);
          return Promise.resolve();
        },
      },
      loader: 'object',
    }));
  },
});

const { HapticTab } = await import('../../src/ui/haptic-tab');
const originalExpoOs = process.env.EXPO_OS;

afterEach(() => {
  cleanup();
  hapticCalls.length = 0;
  if (originalExpoOs === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOs;
});

describe('HapticTab', () => {
  it('renders visible children as an accessible tab link when href is supplied', () => {
    render(
      <HapticTab accessibilityLabel="Logs tab" href="/logs">
        <span>Logs</span>
      </HapticTab>,
    );

    const tab = screen.getByRole('link', { name: 'Logs tab' });
    assert.equal(tab.textContent, 'Logs');
    assert.equal(tab.getAttribute('href'), '/logs');
  });

  it('invokes onPress exactly once for a primary web tab press', () => {
    process.env.EXPO_OS = 'web';
    let presses = 0;
    render(
      <HapticTab accessibilityLabel="Analytics tab" href="/analytics" onPress={() => { presses += 1; }}>
        <span>Analytics</span>
      </HapticTab>,
    );

    const tab = screen.getByRole('link', { name: 'Analytics tab' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const dispatched = tab.dispatchEvent(event);

    assert.equal(presses, 1);
    assert.equal(dispatched, false);
    assert.equal(event.defaultPrevented, true);
  });

  it('leaves modified tab clicks to the browser without invoking onPress', () => {
    process.env.EXPO_OS = 'web';
    let presses = 0;
    render(
      <HapticTab accessibilityLabel="Settings tab" href="/settings" onPress={() => { presses += 1; }}>
        <span>Settings</span>
      </HapticTab>,
    );

    const tab = screen.getByRole('link', { name: 'Settings tab' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    const dispatched = tab.dispatchEvent(event);

    assert.equal(presses, 0);
    assert.equal(dispatched, true);
    assert.equal(event.defaultPrevented, false);
  });

  it('provides light iOS haptic feedback on press-in and preserves onPressIn', async () => {
    process.env.EXPO_OS = 'ios';
    let pressIns = 0;
    render(
      <HapticTab accessibilityLabel="Logs tab" href="/logs" onPressIn={() => { pressIns += 1; }}>
        <span>Logs</span>
      </HapticTab>,
    );

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('link', { name: 'Logs tab' }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    assert.equal(pressIns, 1);
    assert.deepEqual(hapticCalls, ['light']);
  });

  it('does not invoke platform haptics on non-iOS press-in', async () => {
    process.env.EXPO_OS = 'android';
    let pressIns = 0;
    render(
      <HapticTab accessibilityLabel="Logs tab" href="/logs" onPressIn={() => { pressIns += 1; }}>
        <span>Logs</span>
      </HapticTab>,
    );

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('link', { name: 'Logs tab' }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    assert.equal(pressIns, 1);
    assert.deepEqual(hapticCalls, []);
  });
});
