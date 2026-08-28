import assert from 'node:assert/strict';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

type Style = Record<string, unknown> | Array<Record<string, unknown> | undefined> | undefined;
type LayoutEvent = { nativeEvent: { layout: { height: number } } };
type ScrollEvent = { nativeEvent: { contentOffset: { y: number } } };

let layoutHandler: ((event: LayoutEvent) => void) | undefined;
let contentSizeHandler: ((width: number, height: number) => void) | undefined;
let scrollHandler: ((event: ScrollEvent) => void) | undefined;

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

function flattenStyle(style: Style): Record<string, unknown> | undefined {
  if (!Array.isArray(style)) return style;
  return Object.assign({}, ...style.filter((entry): entry is Record<string, unknown> => entry !== undefined));
}

// Bun's preload resolver maps react-native to react-native-web before test
// modules load. Register a local DOM boundary after preload so the native
// layout/content-size/scroll events remain directly controllable in happy-dom.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'fading-scroll-view-native-test-double',
  setup(build: Build) {
    build.module('react-native', () => ({
      exports: {
        ScrollView: ({
          children,
          contentContainerStyle,
          onContentSizeChange,
          onScroll,
          style,
        }: {
          children?: ReactNode;
          contentContainerStyle?: Style;
          onContentSizeChange?: (width: number, height: number) => void;
          onScroll?: (event: ScrollEvent) => void;
          style?: Style;
        }) => {
          contentSizeHandler = onContentSizeChange;
          scrollHandler = onScroll;
          return (
            <div aria-label="Scrollable content" role="region" style={flattenStyle(style)}>
              <div style={flattenStyle(contentContainerStyle)}>{children}</div>
            </div>
          );
        },
        StyleSheet: { create: <T extends Record<string, unknown>>(styles: T) => styles },
        View: ({ children, onLayout, pointerEvents, style }: {
          children?: ReactNode;
          onLayout?: (event: LayoutEvent) => void;
          pointerEvents?: string;
          style?: Style;
        }) => {
          if (onLayout) layoutHandler = onLayout;
          void pointerEvents;
          return <div style={flattenStyle(style)}>{children}</div>;
        },
      },
      loader: 'object',
    }));
  },
});

mock.module('expo-linear-gradient', () => ({
  LinearGradient: ({ colors }: { colors: string[] }) => (
    <div aria-label={colors[0] === 'transparent' ? 'bottom fade' : 'top fade'} />
  ),
}));

const { FadingScrollView } = await import('../../src/ui/primitives/fading-scroll-view');

afterEach(() => {
  cleanup();
  layoutHandler = undefined;
  contentSizeHandler = undefined;
  scrollHandler = undefined;
});

function fadeOpacity(label: string): string {
  const fade = screen.getByLabelText(label);
  return fade.parentElement?.style.opacity ?? '';
}

function emitLayout(height: number): void {
  act(() => layoutHandler?.({ nativeEvent: { layout: { height } } }));
}

function emitContentSize(height: number): void {
  act(() => contentSizeHandler?.(320, height));
}

function emitScroll(y: number): void {
  act(() => scrollHandler?.({ nativeEvent: { contentOffset: { y } } }));
}

describe('FadingScrollView', () => {
  it('renders empty and populated content in an accessible scroll region', () => {
    const { rerender } = render(<FadingScrollView />);
    assert.ok(screen.getByRole('region', { name: 'Scrollable content' }));

    rerender(
      <FadingScrollView contentContainerStyle={{ padding: 12 }}>
        <span>Workout notes</span>
      </FadingScrollView>,
    );
    assert.ok(screen.getByText('Workout notes'));
  });

  it('shows the bottom fade for overflow, then both edges while scrolling, and only the top at the end', () => {
    render(
      <FadingScrollView>
        <span>Long workout history</span>
      </FadingScrollView>,
    );

    assert.equal(fadeOpacity('top fade'), '0');
    assert.equal(fadeOpacity('bottom fade'), '0');

    emitLayout(100);
    emitContentSize(200);
    assert.equal(fadeOpacity('top fade'), '0');
    assert.equal(fadeOpacity('bottom fade'), '1');

    emitScroll(20);
    assert.equal(fadeOpacity('top fade'), '1');
    assert.equal(fadeOpacity('bottom fade'), '1');

    emitScroll(100);
    assert.equal(fadeOpacity('top fade'), '1');
    assert.equal(fadeOpacity('bottom fade'), '0');
  });

  it('keeps both fades hidden when content does not overflow the viewport', () => {
    render(
      <FadingScrollView>
        <span>Short workout history</span>
      </FadingScrollView>,
    );

    emitLayout(200);
    emitContentSize(200);
    emitScroll(40);

    assert.equal(fadeOpacity('top fade'), '0');
    assert.equal(fadeOpacity('bottom fade'), '0');
  });
});
