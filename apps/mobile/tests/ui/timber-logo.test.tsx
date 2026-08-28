import assert from 'node:assert/strict';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import { type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Use DOM SVG primitives for the native SVG package so the test observes the
// same user-visible geometry without loading its native codegen module.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'timber-logo-svg-test-double',
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

const { TimberLogo } = await import('../../src/ui/timber-logo');

afterEach(() => {
  cleanup();
});

describe('TimberLogo', () => {
  it('renders the default logo at its documented size without a badge background', () => {
    const { container } = render(<TimberLogo />);
    const svg = container.querySelector('svg');

    assert.ok(svg);
    assert.equal(svg.getAttribute('width'), '96');
    assert.equal(svg.getAttribute('height'), '96');
    assert.equal(svg.getAttribute('viewBox'), '0 0 1024 1024');
    assert.equal(svg.querySelectorAll('circle').length, 36);
    assert.equal(svg.querySelector('rect'), null);
  });

  it('renders a custom-sized badge when the background option is enabled', () => {
    const { container } = render(<TimberLogo size={48} withBackground />);
    const svg = container.querySelector('svg');

    assert.ok(svg);
    assert.equal(svg.getAttribute('width'), '48');
    assert.equal(svg.getAttribute('height'), '48');
    assert.ok(svg.querySelector('rect'));
    assert.equal(svg.querySelectorAll('circle').length, 36);
  });
});
