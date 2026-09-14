import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

const timingCalls: Array<{ to: number; duration: number; easing: unknown }> = [];
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
    const readStyle = (key: string) =>
      styles.find(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === 'object' && key in entry),
      )?.[key];

    return (
      <div
        aria-hidden={accessibilityElementsHidden ? 'true' : undefined}
        data-bottom={readStyle('bottom')}
        data-position={readStyle('position')}
        data-left={readStyle('left')}
        data-margin-left={readStyle('marginLeft')}
        data-margin-top={readStyle('marginTop')}
        data-opacity={readStyle('opacity')}
        data-testid={testID}
        data-top={readStyle('top')}
        data-translate-y={translateY}
      >
        {children}
      </div>
    );
  };

  return {
    default: { View: AnimatedView },
    Easing: {
      bezier: (...controlPoints: number[]) => ({ type: 'bezier', controlPoints }),
      out: (easing: unknown) => ({ type: 'out', easing }),
      quad: { type: 'quad' },
    },
    interpolate: () => 1,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => reducedMotion,
    useSharedValue: (value: number) => ({ value }),
    withDelay: (delay: number, animation: unknown) => {
      delayCalls.push(delay);
      return animation;
    },
    withTiming: (to: number, config: { duration: number; easing: unknown }) => {
      timingCalls.push({ to, duration: config.duration, easing: config.easing });
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

    const container = screen.getByTestId('finish-workout-celebration');
    const stage = screen.getByTestId('finish-workout-stage');
    assert.match(container.className, /r-flex-/);
    assert.match(container.className, /r-backgroundColor-/);
    assert.match(stage.className, /r-position-/);
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      assert.match(stage.className, new RegExp(`r-${edge}-`));
    }

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
    const labelContainer = screen.getByTestId('finish-workout-label');
    assert.equal(labelContainer.getAttribute('data-bottom'), '112');
    assert.equal(labelContainer.getAttribute('data-position'), 'absolute');
    assert.equal(screen.queryByText('✓', { exact: true }), null);
  });

  it('uses varied bounded timing and only straight vertical motion', () => {
    render(<FinishWorkoutCelebration />);

    assert.equal(timingCalls.length, 10);
    assert.equal(delayCalls.length, 10);
    assert.ok(new Set(delayCalls.slice(0, 9)).size >= 5);
    for (const delay of delayCalls.slice(0, 9)) assert.ok(delay >= 0 && delay <= 280);
    for (const { to, duration } of timingCalls.slice(0, 9)) {
      assert.equal(to, 0);
      assert.ok(duration >= 340 && duration <= 400);
    }
    assert.deepEqual(
      timingCalls.slice(0, 9).map(({ easing }) => easing),
      Array.from({ length: 9 }, () => ({
        type: 'bezier',
        controlPoints: [0.22, 0.78, 0.3, 1],
      })),
    );
    assert.deepEqual(timingCalls[9], {
      to: 1,
      duration: 180,
      easing: { type: 'out', easing: { type: 'quad' } },
    });
    assert.equal(delayCalls[9], 760);

    const logs = screen.getAllByTestId(/^finish-workout-log-/);
    const startHeights = logs.map((log) => Number(log.getAttribute('data-translate-y')));
    assert.ok(new Set(startHeights).size >= 5);
    assert.ok(startHeights.every((height) => height <= -(window.innerHeight * 0.55) + 1));
    assert.ok(logs.every((log) => !log.getAttribute('data-translate-x')));

    const targetOffsets = logs
      .map((log) => [
        Number(log.getAttribute('data-margin-left')),
        Number(log.getAttribute('data-margin-top')),
      ])
      .sort(([leftA, topA], [leftB, topB]) => leftA - leftB || topA - topB);
    assert.deepEqual(targetOffsets, [
      [-145, -62],
      [-111, -28],
      [-77, 6],
      [-43, 40],
      [-9, 6],
      [25, -28],
      [59, -62],
      [93, -96],
      [127, -130],
    ]);
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
    assert.equal(screen.getByTestId('finish-workout-label').getAttribute('data-opacity'), '1');
  });
});
