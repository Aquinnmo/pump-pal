import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

const timingCalls: Array<{ to: number; duration: number }> = [];
const delayCalls: number[] = [];
let reducedMotion = false;

mock.module('react-native-reanimated', () => {
  const AnimatedView = ({
    accessibilityElementsHidden,
    children,
    style,
    testID,
  }: {
    accessibilityElementsHidden?: boolean;
    children?: ReactNode;
    style?: unknown;
    testID?: string;
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    const transform = styles
      .filter((entry): entry is { transform?: Array<Record<string, number>> } =>
        Boolean(entry && typeof entry === 'object'),
      )
      .flatMap((entry) => entry.transform ?? []);
    const translateY = transform.find((entry) => 'translateY' in entry)?.translateY;

    return (
      <div
        aria-hidden={accessibilityElementsHidden ? 'true' : undefined}
        data-testid={testID}
        data-translate-y={translateY}
      >
        {children}
      </div>
    );
  };

  return {
    default: { View: AnimatedView },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => reducedMotion,
    useSharedValue: (value: number) => ({ value }),
    withDelay: (delay: number, animation: unknown) => {
      delayCalls.push(delay);
      return animation;
    },
    withTiming: (to: number, config: { duration: number }) => {
      timingCalls.push({ to, duration: config.duration });
      return to;
    },
  };
});

// Keep the end-face test on the real Timber SVG geometry while replacing the
// native SVG host with queryable DOM elements.
mock.module('react-native-svg', () => ({
  default: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <svg {...props}>{children}</svg>
  ),
  Circle: (props: Record<string, unknown>) => <circle {...props} />,
  Rect: (props: Record<string, unknown>) => <rect {...props} />,
}));

const { FinishWorkoutCelebration } = await import(
  '../../src/ui/workout/finish-workout-celebration'
);

afterEach(() => {
  cleanup();
  timingCalls.length = 0;
  delayCalls.length = 0;
  reducedMotion = false;
});

describe('FinishWorkoutCelebration', () => {
  it('renders nine hidden Timber end faces and one polite completion label', () => {
    render(<FinishWorkoutCelebration />);

    const logs = screen.getAllByTestId(/^finish-workout-log-/);
    assert.equal(logs.length, 9);
    for (const log of logs) assert.equal(log.getAttribute('aria-hidden'), 'true');

    const faces = document.querySelectorAll('svg');
    assert.equal(faces.length, 9);
    for (const face of faces) {
      assert.equal(face.getAttribute('width'), '48');
      assert.equal(face.getAttribute('height'), '48');
      assert.equal(face.querySelectorAll('circle').length, 6);
      assert.equal(face.querySelector('[fill="#4ade80"]'), null);
      assert.equal(face.querySelector('[stroke="#4ade80"]'), null);
    }

    const label = screen.getByText('Workout complete', { exact: true });
    assert.equal(label.getAttribute('aria-live'), 'polite');
    assert.ok(screen.getByText('✓', { exact: true }));
  });

  it('uses varied bounded timing and only straight vertical motion', () => {
    render(<FinishWorkoutCelebration />);

    assert.equal(timingCalls.length, 9);
    assert.equal(delayCalls.length, 9);
    assert.ok(new Set(delayCalls).size >= 5);
    for (const delay of delayCalls) assert.ok(delay >= 0 && delay <= 240);
    for (const { to, duration } of timingCalls) {
      assert.equal(to, 0);
      assert.ok(duration >= 420 && duration <= 620);
    }

    const startHeights = screen
      .getAllByTestId(/^finish-workout-log-/)
      .map((log) => Number(log.getAttribute('data-translate-y')));
    assert.equal(new Set(startHeights).size, 9);
    assert.ok(startHeights.every((height) => height < 0));
  });

  it('keeps all logs assembled and static when reduced motion is enabled', () => {
    reducedMotion = true;
    render(<FinishWorkoutCelebration />);

    assert.deepEqual(timingCalls, []);
    assert.deepEqual(delayCalls, []);
    const finalHeights = screen
      .getAllByTestId(/^finish-workout-log-/)
      .map((log) => Number(log.getAttribute('data-translate-y')));
    assert.deepEqual(finalHeights, Array.from({ length: 9 }, () => 0));
  });
});
