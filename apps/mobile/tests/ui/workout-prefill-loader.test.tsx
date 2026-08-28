import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

mock.module('react-native-reanimated', () => {
  const AnimatedView = ({
    accessibilityLabel,
    accessibilityLiveRegion,
    accessibilityRole,
    children,
  }: {
    accessibilityLabel?: string;
    accessibilityLiveRegion?: 'polite' | 'assertive' | 'off';
    accessibilityRole?: string;
    children?: ReactNode;
  }) => (
    <div
      aria-label={accessibilityLabel}
      aria-live={accessibilityLiveRegion}
      role={accessibilityRole}
    >
      {children}
    </div>
  );

  return {
    default: { View: AnimatedView },
    cancelAnimation: () => undefined,
    Easing: { inOut: (easing: unknown) => easing, quad: {} },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    interpolate: () => 1,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (animation: unknown) => animation,
    withTiming: (value: number) => value,
  };
});

const { WorkoutPrefillLoader } = await import('../../src/ui/primitives/workout-prefill-loader');

afterEach(() => {
  cleanup();
});

describe('WorkoutPrefillLoader', () => {
  it('renders the default loading copy when no workout name is available', () => {
    render(<WorkoutPrefillLoader workoutName={null} />);

    const loader = screen.getByRole('progressbar', { name: 'Loading your workout…' });
    assert.equal(loader.getAttribute('aria-label'), 'Loading your workout…');
    assert.ok(screen.getByText('Loading your workout…'));
    assert.ok(screen.getByText('Racking your last session'));
    assert.equal(screen.queryByRole('button'), null);
  });

  it('includes a populated workout name in the default loading copy', () => {
    render(<WorkoutPrefillLoader workoutName="Push Day" />);

    assert.ok(screen.getByRole('progressbar', { name: 'Loading Push Day…' }));
    assert.ok(screen.getByText('Loading Push Day…'));
    assert.ok(screen.getByText('Racking your last session'));
  });

  it('uses explicit label and subtitle overrides exactly', () => {
    render(
      <WorkoutPrefillLoader
        workoutName="Push Day"
        label="Preparing your next session"
        subtitle="Loading saved exercises"
      />,
    );

    const loader = screen.getByRole('progressbar', {
      name: 'Preparing your next session',
    });
    assert.equal(loader.getAttribute('aria-label'), 'Preparing your next session');
    assert.ok(screen.getByText('Preparing your next session'));
    assert.ok(screen.getByText('Loading saved exercises'));
    assert.equal(screen.queryByText('Loading Push Day…'), null);
  });
});
