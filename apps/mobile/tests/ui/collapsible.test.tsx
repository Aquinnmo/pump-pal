import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

mock.module('@expo/vector-icons/MaterialIcons', () => ({
  default: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { Collapsible } = await import('../../src/ui/primitives/collapsible');

afterEach(() => {
  cleanup();
});

describe('Collapsible', () => {
  it('starts collapsed, then reveals and hides supplied content through title interaction', () => {
    render(
      <Collapsible title="Training notes">
        <span>Last session: 3 sets</span>
      </Collapsible>,
    );

    const title = screen.getByText('Training notes');
    assert.equal(title.textContent, 'Training notes');
    assert.equal(screen.queryByText('Last session: 3 sets'), null);

    fireEvent.click(title);
    assert.ok(screen.getByText('Last session: 3 sets'));

    fireEvent.click(title);
    assert.equal(screen.queryByText('Last session: 3 sets'), null);
  });
});
