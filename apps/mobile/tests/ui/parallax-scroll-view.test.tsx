import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

type Style = Record<string, unknown> | Array<Record<string, unknown> | undefined> | undefined;

let scrollOffset = 0;
let colorScheme: 'light' | 'dark' = 'light';

function flattenStyle(style: Style): Record<string, unknown> {
  if (!Array.isArray(style)) return style ?? {};
  return Object.assign({}, ...style.filter((entry): entry is Record<string, unknown> => entry !== undefined));
}

function interpolateValue(value: number, input: number[], output: number[]): number {
  if (value <= input[0]) return output[0];
  if (value >= input[input.length - 1]) return output[output.length - 1];
  for (let index = 1; index < input.length; index += 1) {
    if (value > input[index]) continue;
    const fraction = (value - input[index - 1]) / (input[index] - input[index - 1]);
    return output[index - 1] + fraction * (output[index] - output[index - 1]);
  }
  return output[output.length - 1];
}

mock.module(new URL('../../src/hooks/use-color-scheme.web.ts', import.meta.url).pathname, () => ({
  useColorScheme: () => colorScheme,
}));

mock.module('react-native-reanimated', () => {
  const AnimatedScrollView = ({
    children,
    scrollEventThrottle,
    style,
  }: {
    children?: ReactNode;
    scrollEventThrottle?: number;
    style?: Style;
  }) => {
    const flattened = flattenStyle(style);
    return (
      <div
        role="region"
        aria-label="Parallax content"
        data-scroll-event-throttle={scrollEventThrottle}
        style={{ backgroundColor: flattened.backgroundColor as string }}
      >
        {children}
      </div>
    );
  };

  const AnimatedView = ({ children, style }: { children?: ReactNode; style?: Style }) => {
    const flattened = flattenStyle(style);
    return (
      <div
        data-parallax-header="true"
        data-background-color={flattened.backgroundColor as string}
        data-transform={JSON.stringify(flattened.transform)}
      >
        {children}
      </div>
    );
  };

  return {
    default: { ScrollView: AnimatedScrollView, View: AnimatedView },
    interpolate: interpolateValue,
    useAnimatedRef: () => null,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useScrollOffset: () => ({ value: scrollOffset }),
  };
});

const { default: ParallaxScrollView } = await import('../../src/ui/parallax-scroll-view');

function renderView(children?: ReactNode) {
  return render(
    <ParallaxScrollView
      headerImage={<span role="img" aria-label="Training illustration">Header art</span>}
      headerBackgroundColor={{ light: '#fef3c7', dark: '#172554' }}
    >
      {children}
    </ParallaxScrollView>,
  );
}

beforeEach(() => {
  scrollOffset = 0;
  colorScheme = 'light';
});

afterEach(() => {
  cleanup();
});

describe('ParallaxScrollView', () => {
  it('renders the optional empty content baseline with accessible header and scroll options', () => {
    renderView();

    assert.ok(screen.getByRole('region', { name: 'Parallax content' }));
    assert.ok(screen.getByRole('img', { name: 'Training illustration' }));
    assert.equal(screen.queryByText('Workout summary'), null);

    const header = document.querySelector('[data-parallax-header="true"]');
    assert.ok(header);
    assert.equal(header.getAttribute('data-background-color'), '#fef3c7');
    assert.equal(screen.getByRole('region').getAttribute('data-scroll-event-throttle'), '16');
  });

  it('keeps populated content visible and applies the documented parallax transform while scrolling', () => {
    const view = renderView(<span>Workout summary</span>);
    assert.ok(screen.getByText('Workout summary', { exact: true }));

    let header = document.querySelector('[data-parallax-header="true"]');
    assert.ok(header);
    assert.equal(header.getAttribute('data-transform'), JSON.stringify([
      { translateY: 0 },
      { scale: 1 },
    ]));

    scrollOffset = 100;
    view.rerender(
      <ParallaxScrollView
        headerImage={<span role="img" aria-label="Training illustration">Header art</span>}
        headerBackgroundColor={{ light: '#fef3c7', dark: '#172554' }}
      >
        <span>Workout summary</span>
      </ParallaxScrollView>,
    );
    header = document.querySelector('[data-parallax-header="true"]');
    assert.ok(header);
    assert.equal(header.getAttribute('data-transform'), JSON.stringify([
      { translateY: 75 },
      { scale: 1 },
    ]));
  });

  it('uses the dark header background and scales the image for an overscroll pull-down', () => {
    colorScheme = 'dark';
    scrollOffset = -250;
    renderView(<span>Workout summary</span>);

    const header = document.querySelector('[data-parallax-header="true"]');
    assert.ok(header);
    assert.equal(header.getAttribute('data-background-color'), '#172554');
    assert.equal(header.getAttribute('data-transform'), JSON.stringify([
      { translateY: -125 },
      { scale: 2 },
    ]));
  });
});
