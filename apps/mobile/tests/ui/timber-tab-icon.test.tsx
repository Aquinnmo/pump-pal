import assert from 'node:assert/strict';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import { type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Render the native SVG primitives as browser SVG elements so the test observes
// the icon's visible tint and sizing without loading the native codegen module.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'timber-tab-icon-svg-test-double',
  setup(build: Build) {
    build.module('react-native-svg', () => ({
      exports: {
        default: ({ children, accessible, ...props }: { children?: ReactNode; accessible?: boolean; [key: string]: unknown }) => (
          <svg {...props} aria-hidden={accessible === false ? 'true' : undefined}>{children}</svg>
        ),
        Circle: (props: Record<string, unknown>) => <circle {...props} />,
        Path: (props: Record<string, unknown>) => <path {...props} />,
        Rect: (props: Record<string, unknown>) => <rect {...props} />,
      },
      loader: 'object',
    }));
  },
});

const { TimberTabIcon } = await import('../../src/ui/timber-tab-icon');

afterEach(() => {
  cleanup();
});

describe('TimberTabIcon', () => {
  it('renders a decorative icon at the requested tab size', () => {
    const { container } = render(<TimberTabIcon size={24} color="#555" />);
    const svg = container.querySelector('svg');

    assert.ok(svg);
    assert.equal(svg.getAttribute('width'), '24');
    assert.equal(svg.getAttribute('height'), '24');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
  });

  it('uses the inactive and active tab tint supplied by the tab navigator', () => {
    const inactive = render(<TimberTabIcon size={20} color="#555" />);
    const inactiveSvg = inactive.container.querySelector('svg');
    assert.ok(inactiveSvg);
    assert.equal(inactiveSvg.querySelector('rect')?.getAttribute('stroke'), '#555');
    assert.equal(inactiveSvg.querySelector('path')?.getAttribute('stroke'), '#555');

    inactive.unmount();

    const active = render(<TimberTabIcon size={20} color="#e54242" />);
    const activeSvg = active.container.querySelector('svg');
    assert.ok(activeSvg);
    assert.equal(activeSvg.querySelector('rect')?.getAttribute('stroke'), '#e54242');
    assert.equal(activeSvg.querySelector('path')?.getAttribute('stroke'), '#e54242');
    assert.equal(activeSvg.querySelectorAll('path')[1]?.getAttribute('fill'), '#e54242');
  });
});
