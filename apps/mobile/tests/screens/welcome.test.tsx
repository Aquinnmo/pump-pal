import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { forwardRef, useImperativeHandle, useState, type ForwardedRef, type ReactNode } from 'react';

const routerReplacements: string[] = [];

mock.module(new URL('../../src/ui/timber-auth-shell.tsx', import.meta.url).pathname, () => ({
  TimberAuthShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TimberBrand: ({ title = 'Timber' }: { title?: string }) => <div>{title}</div>,
  timberAuthStyles: {
    primaryButton: {},
    primaryButtonText: {},
  },
}));
mock.module(new URL('../../src/ui/timber-logo.tsx', import.meta.url).pathname, () => ({
  TimberLogo: () => <span aria-label="Timber logo" />,
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Use a deterministic list double so the real screen's on-screen slide order
// and Next/Get Started choices remain observable in happy-dom.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'welcome-screen-test-doubles',
  setup(build: Build) {
    const FlatList = forwardRef(function FlatList<T extends { id: string }>(
      {
        data,
        renderItem,
        onScroll,
      }: {
        data: T[];
        renderItem: (info: { item: T }) => ReactNode;
        onScroll?: (event: { nativeEvent: { contentOffset: { x: number } } }) => void;
      },
      ref: ForwardedRef<{ scrollToIndex: (options: { index: number; animated: boolean }) => void }>,
    ) {
      const [index, setIndex] = useState(0);
      useImperativeHandle(ref, () => ({
        scrollToIndex: ({ index: nextIndex }) => {
          setIndex(nextIndex);
          onScroll?.({ nativeEvent: { contentOffset: { x: nextIndex * 390 } } });
        },
      }), [onScroll]);
      return <div data-testid="welcome-slide-list">{renderItem({ item: data[index]! })}</div>;
    });

    const TouchableOpacity = ({
      accessibilityLabel,
      children,
      onPress,
    }: {
      accessibilityLabel?: string;
      children?: ReactNode;
      onPress?: () => void;
    }) => <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>;
    const Text = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    const View = ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) => (
      <div aria-label={accessibilityLabel}>{children}</div>
    );
    const StyleSheet = { create: <T,>(styles: T): T => styles };

    build.module('react-native', () => ({
      exports: {
        FlatList,
        StyleSheet,
        Text,
        TouchableOpacity,
        View,
        useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
      },
      loader: 'object',
    }));
    build.module('expo-router', () => ({
      exports: {
        router: { replace: (href: string) => routerReplacements.push(href) },
      },
      loader: 'object',
    }));
  },
});

const storage = await import('@react-native-async-storage/async-storage');
const { default: WelcomeScreen } = await import('../../app/(auth)/welcome');

beforeEach(async () => {
  routerReplacements.length = 0;
  await storage.default.clear();
});

afterEach(() => {
  cleanup();
});

describe('WelcomeScreen', () => {
  it('renders the first welcome slide and its visible primary controls', () => {
    render(<WelcomeScreen />);

    assert.ok(screen.getByText('Welcome to Timber', { exact: true }));
    assert.ok(screen.getByText('Timber is named for logging your workouts.', { exact: true }));
    assert.ok(screen.getByText('Log every lift, then watch your strength and consistency grow over time.', { exact: true }));
    assert.ok(screen.getByText('01 / 04', { exact: true }));
    assert.ok(screen.getByLabelText('Welcome screen 1 of 4'));
    assert.ok(screen.getByRole('button', { name: 'Skip welcome and sign in' }));
    assert.ok(screen.getByRole('button', { name: 'Next welcome screen' }));
  });

  it('marks onboarding and routes to sign-in when Skip is pressed', async () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip welcome and sign in' }));

    await waitFor(() => assert.deepEqual(routerReplacements, ['/(auth)/sign-in']));
    assert.equal(await storage.default.getItem('pumppal_onboarding_seen'), 'true');
  });

  it('advances the visible slides and routes from Get Started on the final slide', async () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next welcome screen' }));
    assert.ok(screen.getByText('Log the work', { exact: true }));
    assert.ok(screen.getByText('02 / 04', { exact: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Next welcome screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next welcome screen' }));
    assert.ok(screen.getByText('See what you’ve grown', { exact: true }));
    assert.ok(screen.getByText('04 / 04', { exact: true }));
    assert.ok(screen.getByRole('button', { name: 'Get started with Timber' }));

    fireEvent.click(screen.getByRole('button', { name: 'Get started with Timber' }));
    await waitFor(() => assert.deepEqual(routerReplacements, ['/(auth)/sign-in']));
    assert.equal(await storage.default.getItem('pumppal_onboarding_seen'), 'true');
  });
});
