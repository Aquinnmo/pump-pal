import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

const animatedStyles: unknown[] = [];

// Reanimated's worklet runtime is outside happy-dom's scope. Keep its Text
// boundary visible as ordinary browser text while retaining the style payload
// so the rendered animation contract remains observable.
mock.module('react-native-reanimated', () => {
  const AnimatedText = ({ children, style }: { children?: ReactNode; style?: unknown }) => {
    animatedStyles.push(style);
    return <span>{children}</span>;
  };

  return { default: { Text: AnimatedText } };
});

const { HelloWave } = await import('../../src/ui/hello-wave');

afterEach(() => {
  cleanup();
  animatedStyles.length = 0;
});

describe('HelloWave', () => {
  it('renders the waving-hand content as visible, queryable text', () => {
    render(<HelloWave />);

    const wave = screen.getByText('👋');
    assert.equal(wave.textContent, '👋');
  });

  it('passes the documented animation presentation to the native boundary', () => {
    render(<HelloWave />);

    assert.equal(animatedStyles.length, 1);
    assert.deepEqual(animatedStyles[0], {
      fontSize: 28,
      lineHeight: 32,
      marginTop: -6,
      animationName: {
        '50%': { transform: [{ rotate: '25deg' }] },
      },
      animationIterationCount: 4,
      animationDuration: '300ms',
    });
  });
});
