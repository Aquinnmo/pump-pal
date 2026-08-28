import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};
type Style = Record<string, unknown> | Array<Record<string, unknown> | undefined> | undefined;

function flattenStyle(style: Style): Record<string, unknown> | undefined {
  if (!Array.isArray(style)) return style;
  return Object.assign({}, ...style.filter((entry): entry is Record<string, unknown> => entry !== undefined));
}

// Keep the logo's browser-visible SVG geometry while avoiding the native
// codegen module in the happy-dom runner.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'timber-auth-shell-svg-test-double',
  setup(build: Build) {
    build.module('react-native-svg', () => ({
      exports: {
        default: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
          <svg {...props}>{children}</svg>
        ),
        Circle: (props: Record<string, unknown>) => <circle {...props} />,
        Rect: (props: Record<string, unknown>) => <rect {...props} />,
      },
      loader: 'object',
    }));
  },
});

mock.module('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: { children?: ReactNode; style?: Style }) => (
    <div style={flattenStyle(style)}>{children}</div>
  ),
}));

mock.module('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children?: ReactNode; style?: Style }) => (
    <div style={flattenStyle(style)}>{children}</div>
  ),
}));

const { TimberAuthShell, TimberBrand } = await import('../../src/ui/timber-auth-shell');

afterEach(() => {
  cleanup();
});

describe('TimberAuthShell', () => {
  it('composes arbitrary auth content inside the safe-area shell', () => {
    render(
      <TimberAuthShell contentStyle={{ padding: 20 }}>
        <span>Sign in form</span>
      </TimberAuthShell>,
    );

    assert.ok(screen.getByText('Sign in form'));
  });

  it('renders the default Timber brand without optional copy', () => {
    const { container } = render(<TimberBrand />);

    assert.ok(screen.getByText('Timber', { exact: true }));
    assert.equal(screen.queryByText('Welcome back', { exact: true }), null);
    assert.equal(screen.queryByText('Train with intent', { exact: true }), null);
    assert.equal(container.querySelector('svg')?.getAttribute('width'), '74');
  });

  it('renders optional eyebrow, title, subtitle, and compact composition', () => {
    const { container } = render(
      <TimberBrand
        compact
        eyebrow="Welcome back"
        subtitle="Train with intent"
        title="Pick up your log"
      />,
    );

    assert.ok(screen.getByText('Welcome back', { exact: true }));
    assert.ok(screen.getByText('Pick up your log', { exact: true }));
    assert.ok(screen.getByText('Train with intent', { exact: true }));
    assert.equal(container.querySelector('svg')?.getAttribute('width'), '42');
  });
});
