import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

type StackOptions = { headerShown?: boolean };
type ScreenOptions = Record<string, unknown>;
type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

function Stack({ screenOptions, children }: { screenOptions?: StackOptions; children?: ReactNode }) {
  return (
    <section aria-label="Auth navigation" data-header-shown={String(screenOptions?.headerShown)}>
      {children}
    </section>
  );
}

Stack.Screen = function Screen({ name, options }: { name: string; options?: ScreenOptions }) {
  return (
    <div
      role="link"
      aria-label={`Auth route ${name}`}
      data-testid="auth-route"
      data-route-name={name}
      data-options={JSON.stringify(options ?? {})}>
      {name}
    </div>
  );
};

// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'auth-layout-navigation-test-double',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: { Stack },
      loader: 'object',
    }));
  },
});

const { default: AuthLayout } = await import('../../app/(auth)/_layout');

afterEach(() => {
  cleanup();
});

describe('AuthLayout', () => {
  it('renders the auth navigator with hidden headers and the visible route declarations in order', () => {
    render(<AuthLayout />);

    const navigation = screen.getByRole('region', { name: 'Auth navigation' });
    assert.equal(navigation.getAttribute('data-header-shown'), 'false');
    assert.deepEqual(
      screen.getAllByTestId('auth-route').map((route) => route.getAttribute('data-route-name')),
      ['welcome', 'sign-in', 'sign-up'],
    );
    assert.ok(screen.getByRole('link', { name: 'Auth route welcome' }));
    assert.ok(screen.getByRole('link', { name: 'Auth route sign-in' }));
    assert.ok(screen.getByRole('link', { name: 'Auth route sign-up' }));
  });

  it('keeps each auth route on the parent navigation options boundary', () => {
    render(<AuthLayout />);

    for (const route of screen.getAllByTestId('auth-route')) {
      assert.deepEqual(JSON.parse(route.getAttribute('data-options') ?? '{}'), {});
    }
  });
});
