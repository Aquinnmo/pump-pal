import assert from 'node:assert/strict';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { Toast } = await import('../../src/ui/primitives/toast');

type FakeTimerApi = {
  advanceTimersByTime(milliseconds: number): void;
  useFakeTimers(): void;
  useRealTimers(): void;
};

// Bun exposes vi's timer controls at runtime, but Bun 1.4's bun:test types do
// not export that namespace yet.
const { vi } = (await import('bun:test')) as unknown as { vi: FakeTimerApi };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders nothing when hidden', () => {
    render(<Toast visible={false} message="Saved workout" onHide={() => undefined} />);

    // BUG: visible=false unmounts immediately, so the exit animation cannot play.
    assert.equal(screen.queryByText('Saved workout'), null);
  });

  it('renders visible semantic message content', () => {
    render(<Toast visible message="Workout saved" onHide={() => undefined} type="success" />);

    const message = screen.getByText('Workout saved');
    assert.equal(message.textContent, 'Workout saved');
  });

  it('fires onHide after the current three-second timer and fade completion', () => {
    vi.useFakeTimers();
    let hideCalls = 0;
    const onHide = () => {
      hideCalls += 1;
    };
    render(<Toast visible message="Workout saved" onHide={onHide} />);

    act(() => vi.advanceTimersByTime(2999));
    assert.equal(hideCalls, 0);

    act(() => vi.advanceTimersByTime(301));
    assert.equal(hideCalls, 1);
  });

  it('recreates the three-second timer when onHide identity changes', () => {
    vi.useFakeTimers();
    let firstHideCalls = 0;
    let secondHideCalls = 0;
    const firstOnHide = () => {
      firstHideCalls += 1;
    };
    const secondOnHide = () => {
      secondHideCalls += 1;
    };
    const rendered = render(<Toast visible message="Workout saved" onHide={firstOnHide} />);

    act(() => vi.advanceTimersByTime(2000));
    rendered.rerender(<Toast visible message="Workout saved" onHide={secondOnHide} />);

    // BUG: onHide is an effect dependency, so every inline callback identity
    // change cancels and recreates the three-second dismissal timer.
    act(() => vi.advanceTimersByTime(1000));
    assert.equal(firstHideCalls, 0);
    assert.equal(secondHideCalls, 0);

    act(() => vi.advanceTimersByTime(2301));
    assert.equal(firstHideCalls, 0);
    assert.equal(secondHideCalls, 1);
  });
});
