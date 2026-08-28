import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { AnalyticsNavigationRow } = await import('../../src/ui/analytics-navigation-row');

afterEach(() => {
  cleanup();
});

describe('AnalyticsNavigationRow', () => {
  it('renders the title and accessible button label without optional children', () => {
    let presses = 0;
    render(
      <AnalyticsNavigationRow
        title="Muscle Load"
        accessibilityLabel="Recent muscle load. Past 7 days."
        accessibilityHint="Opens the full muscle load view"
        onPress={() => {
          presses += 1;
        }}
      />,
    );

    const row = screen.getByRole('button', {
      name: 'Recent muscle load. Past 7 days.',
    });
    assert.equal(row.textContent, 'Muscle Load');
    assert.equal(row.getAttribute('aria-label'), 'Recent muscle load. Past 7 days.');
    assert.equal(presses, 0);
  });

  it('renders optional value content and fires onPress exactly once per press', () => {
    let pressedWith: string[] = [];
    render(
      <AnalyticsNavigationRow
        title="Development Progress"
        accessibilityLabel="Development progress. Ready to compare."
        accessibilityHint="Opens development progress"
        onPress={() => {
          pressedWith = [...pressedWith, 'development-progress'];
        }}
      >
        <span>Compared with last quarter</span>
      </AnalyticsNavigationRow>,
    );

    const row = screen.getByRole('button', {
      name: 'Development progress. Ready to compare.',
    });
    assert.equal(row.textContent, 'Development ProgressCompared with last quarter');
    assert.ok(screen.getByText('Compared with last quarter'));

    fireEvent.click(row);
    assert.deepEqual(pressedWith, ['development-progress']);

    fireEvent.click(row);
    assert.deepEqual(pressedWith, ['development-progress', 'development-progress']);
  });
});
