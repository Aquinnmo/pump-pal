import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import { type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

type LinkProps = {
  href: string;
  target?: string;
  children?: ReactNode;
  onPress?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  [key: string]: unknown;
};

let openCalls: { href: string; options: unknown }[] = [];
let lastDefaultPrevented = false;

function TestLink({ href, target, children, onPress, accessibilityLabel, accessibilityHint, ...rest }: LinkProps) {
  return (
    <a
      {...rest}
      href={href}
      target={target}
      aria-label={accessibilityLabel}
      aria-description={accessibilityHint}
      onClick={(event) => {
        onPress?.(event);
        lastDefaultPrevented = event.defaultPrevented;
      }}
    >
      {children}
    </a>
  );
}

// The preload supplies passthrough Expo modules. Replace those platform
// surfaces with DOM-compatible doubles so this test observes the real link
// accessibility and click contract in happy-dom.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'external-link-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: { Link: TestLink },
      loader: 'object',
    }));
    build.module('expo-web-browser', () => ({
      exports: {
        WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
        openBrowserAsync: async (href: string, options: unknown) => {
          openCalls.push({ href, options });
        },
      },
      loader: 'object',
    }));
  },
});

const { ExternalLink } = await import('../../src/ui/external-link');
const originalExpoOs = process.env.EXPO_OS;

afterEach(() => {
  cleanup();
  openCalls = [];
  lastDefaultPrevented = false;
  if (originalExpoOs === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOs;
});

describe('ExternalLink', () => {
  it('renders visible content with an accessible link and external target', () => {
    render(
      <ExternalLink
        href="https://example.com/docs"
        accessibilityLabel="Read the documentation"
        accessibilityHint="Opens the documentation in a browser"
      >
        Read docs
      </ExternalLink>,
    );

    const link = screen.getByRole('link', { name: 'Read the documentation' });
    assert.equal(link.getAttribute('href'), 'https://example.com/docs');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.textContent, 'Read docs');
  });

  it('prevents the native default and opens an in-app browser automatically', async () => {
    process.env.EXPO_OS = 'ios';
    render(<ExternalLink href="https://example.com/native">Open native link</ExternalLink>);

    fireEvent.click(screen.getByRole('link', { name: 'Open native link' }));
    await Promise.resolve();

    assert.equal(lastDefaultPrevented, true);
    assert.deepEqual(openCalls, [{
      href: 'https://example.com/native',
      options: { presentationStyle: 'automatic' },
    }]);
  });

  it('keeps the web default link behavior without opening an in-app browser', async () => {
    process.env.EXPO_OS = 'web';
    render(<ExternalLink href="https://example.com/web">Open web link</ExternalLink>);

    fireEvent.click(screen.getByRole('link', { name: 'Open web link' }));
    await Promise.resolve();

    assert.equal(lastDefaultPrevented, false);
    assert.deepEqual(openCalls, []);
  });
});
