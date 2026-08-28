import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import type { ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

type ScreenDeclaration = {
  name: string;
  options: Record<string, unknown>;
};

type TestGlobal = typeof globalThis & {
  __tabsLayoutDeclarations?: ScreenDeclaration[];
  __tabsLayoutScreenOptions?: Record<string, unknown>;
  __tabsLayoutPresses?: string[];
};

const testGlobal = globalThis as TestGlobal;
testGlobal.__tabsLayoutDeclarations = [];
testGlobal.__tabsLayoutPresses = [];

const hapticTabPath = new URL('../../src/ui/haptic-tab.tsx', import.meta.url).pathname;
const timberTabIconPath = new URL('../../src/ui/timber-tab-icon.tsx', import.meta.url).pathname;

type TabButtonProps = {
  accessibilityLabel?: string;
  children?: ReactNode;
  href?: string;
  onPress?: () => void;
};

// Keep the router boundary observable while rendering the real tab layout. The
// test double exposes the same user-visible anchor seam that Expo Router gives
// HapticTab, without depending on its internal navigator implementation.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'tabs-layout-test-doubles',
  setup(build: Build) {
    const Tabs = Object.assign(
      ({ children, screenOptions }: { children?: ReactNode; screenOptions?: Record<string, unknown> }) => {
        testGlobal.__tabsLayoutScreenOptions = screenOptions ?? {};
        return <nav aria-label="Primary navigation">{children}</nav>;
      },
      {
        Screen: ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
          testGlobal.__tabsLayoutDeclarations?.push({ name, options: options ?? {} });
          return null;
        },
      },
    );

    build.module('expo-router', () => ({
      exports: { Tabs },
      loader: 'object',
    }));

    build.module(hapticTabPath, () => ({
      exports: {
        HapticTab: ({ accessibilityLabel, children, href, onPress }: TabButtonProps) => (
          <a
            href={href}
            aria-label={accessibilityLabel}
            onClick={(event) => {
              event.preventDefault();
              onPress?.();
              if (accessibilityLabel) testGlobal.__tabsLayoutPresses?.push(accessibilityLabel);
            }}>
            {children}
          </a>
        ),
      },
      loader: 'object',
    }));

    build.module(timberTabIconPath, () => ({
      exports: {
        TimberTabIcon: ({ color, size }: { color: string; size: number }) => (
          <span aria-label="Logs icon">{`${size}:${color}`}</span>
        ),
      },
      loader: 'object',
    }));

    build.module('@expo/vector-icons', () => ({
      exports: {
        Ionicons: ({ name, color, size }: { name: string; color: string; size: number }) => (
          <span aria-label={`${name} icon`}>{`${size}:${color}`}</span>
        ),
      },
      loader: 'object',
    }));
  },
});

const { default: TabLayout } = await import('../../app/(tabs)/_layout');

afterEach(() => {
  cleanup();
  testGlobal.__tabsLayoutDeclarations = [];
  testGlobal.__tabsLayoutScreenOptions = {};
  testGlobal.__tabsLayoutPresses = [];
});

function renderLayout(): ScreenDeclaration[] {
  render(<TabLayout />);
  return testGlobal.__tabsLayoutDeclarations ?? [];
}

describe('tabs navigator layout', () => {
  it('declares the visible tabs in order and hides nested routes', () => {
    const declarations = renderLayout();

    assert.deepEqual(
      declarations.map(({ name }) => name),
      ['index', 'workouts', 'analytics', 'pushup-challenge', 'social', 'settings'],
    );
    assert.equal(declarations[0]?.options.title, 'Logs');
    assert.equal(declarations[2]?.options.title, 'Analytics');
    assert.equal(declarations[4]?.options.title, 'Social');
    assert.equal(declarations[5]?.options.title, 'About');
    assert.deepEqual(declarations[1]?.options, { href: null });
    assert.deepEqual(declarations[3]?.options, { href: null });
  });

  it('keeps the navigator tint, chrome, and tab-bar surface contract', () => {
    renderLayout();
    const options = testGlobal.__tabsLayoutScreenOptions ?? {};

    assert.equal(options.tabBarActiveTintColor, '#e54242');
    assert.equal(options.tabBarInactiveTintColor, '#555');
    assert.equal(options.headerShown, false);
    assert.deepEqual(options.tabBarStyle, {
      backgroundColor: '#111',
      borderTopColor: '#1e1e1e',
    });
    assert.equal(typeof options.tabBarButton, 'function');
  });

  it('provides visible accessible icons for each shown tab', () => {
    const declarations = renderLayout();
    const icons = [
      declarations[0]?.options.tabBarIcon,
      declarations[2]?.options.tabBarIcon,
      declarations[4]?.options.tabBarIcon,
      declarations[5]?.options.tabBarIcon,
    ];

    for (const icon of icons) {
      assert.equal(typeof icon, 'function');
      render((icon as (props: { color: string; size: number }) => ReactNode)({ color: '#555', size: 24 }));
    }

    assert.ok(screen.getByLabelText('Logs icon'));
    assert.ok(screen.getByLabelText('stats-chart icon'));
    assert.ok(screen.getByLabelText('people icon'));
    assert.ok(screen.getByLabelText('person icon'));
  });

  it('renders a tab-bar button as an accessible link and forwards one primary press', () => {
    renderLayout();
    const tabBarButton = testGlobal.__tabsLayoutScreenOptions?.tabBarButton;
    assert.equal(typeof tabBarButton, 'function');

    const element = (tabBarButton as (props: TabButtonProps) => ReactNode)({
      accessibilityLabel: 'Analytics tab',
      children: <span>Analytics</span>,
      href: '/analytics',
    });
    render(element);

    const tab = screen.getByRole('link', { name: 'Analytics tab' });
    assert.equal(tab.textContent, 'Analytics');
    assert.equal(tab.getAttribute('href'), '/analytics');
    fireEvent.click(tab);
    assert.deepEqual(testGlobal.__tabsLayoutPresses, ['Analytics tab']);
  });
});
