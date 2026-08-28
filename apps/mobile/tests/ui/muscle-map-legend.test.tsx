import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

// The gradient is a visual platform primitive; the legend's stable seam is its
// accessible description and visible scale labels.
mock.module('expo-linear-gradient', () => ({
  LinearGradient: () => null,
}));

const { MuscleMapLegend } = await import('../../src/ui/muscle-map-legend');

afterEach(() => {
  cleanup();
});

describe('MuscleMapLegend', () => {
  it('renders its accessible description and three scale labels', () => {
    render(
      <MuscleMapLegend
        accessibilityLabel="Muscle load legend. Blue is light, gray is moderate, and amber is heavy."
        labels={['Light', 'Moderate', 'Heavy']}
      />,
    );

    assert.ok(
      screen.getByLabelText(
        'Muscle load legend. Blue is light, gray is moderate, and amber is heavy.',
      ),
    );
    assert.equal(screen.getByText('Light', { exact: true }).textContent, 'Light');
    assert.equal(screen.getByText('Moderate', { exact: true }).textContent, 'Moderate');
    assert.equal(screen.getByText('Heavy', { exact: true }).textContent, 'Heavy');
  });

  it('supports an alternate three-point scale without changing its accessible contract', () => {
    render(
      <MuscleMapLegend
        accessibilityLabel="Development Progress legend. Blue is regression, gray is no change, and amber is improvement."
        labels={['Regression', 'No change', 'Improvement']}
      />,
    );

    const legend = screen.getByLabelText(
      'Development Progress legend. Blue is regression, gray is no change, and amber is improvement.',
    );
    assert.ok(legend);
    for (const label of ['Regression', 'No change', 'Improvement']) {
      assert.ok(screen.getByText(label, { exact: true }));
    }
  });
});
