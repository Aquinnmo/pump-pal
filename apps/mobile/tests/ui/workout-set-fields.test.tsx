import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { DraftSet } from '@/types/workout';

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { SetFields } = await import('../../src/ui/workout/set-fields');

afterEach(() => {
  cleanup();
});

const baseSet: DraftSet = {
  reps: 8,
  weight: '135',
  durationMinutes: 2,
  durationSeconds: 30,
};

describe('SetFields', () => {
  it('renders reps and weight controls, forwarding edits and each stepper press once', () => {
    const events: Array<string> = [];
    let increments = 0;
    let decrements = 0;
    render(
      <SetFields
        bodyweight={false}
        exerciseType="Sets of Reps"
        onDecrement={() => { decrements += 1; }}
        onIncrement={() => { increments += 1; }}
        onUpdate={(field, value) => events.push(`${field}:${value}`)}
        set={baseSet}
      />,
    );

    assert.ok(screen.getByText('Reps', { exact: true }));
    assert.ok(screen.getByText('Weight (lbs)', { exact: true }));
    const weight = screen.getByDisplayValue('135');
    assert.ok(weight);

    fireEvent.change(weight, { target: { value: '150' } });
    fireEvent.click(screen.getByLabelText('remove-circle icon'));
    fireEvent.click(screen.getByLabelText('add-circle icon'));

    assert.deepEqual(events, ['weight:150']);
    assert.equal(decrements, 1);
    assert.equal(increments, 1);
  });

  it('renders duration inputs and forwards minutes and seconds exactly', () => {
    const updates: Array<[string, string]> = [];
    render(
      <SetFields
        bodyweight={false}
        exerciseType="Sets of Duration"
        onDecrement={() => undefined}
        onIncrement={() => undefined}
        onUpdate={(field, value) => updates.push([field, value])}
        set={baseSet}
      />,
    );

    assert.ok(screen.getByText('Minutes', { exact: true }));
    assert.ok(screen.getByText('Seconds', { exact: true }));
    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } });
    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '45' } });

    assert.deepEqual(updates, [
      ['durationMinutes', '3'],
      ['durationSeconds', '45'],
    ]);
  });

  it('hides optional weight for bodyweight reps and normalizes an empty weight on blur', () => {
    const updates: Array<[string, string]> = [];
    render(
      <SetFields
        bodyweight
        exerciseType="Sets of Reps"
        onDecrement={() => undefined}
        onIncrement={() => undefined}
        onUpdate={(field, value) => updates.push([field, value])}
        set={{ ...baseSet, weight: '' }}
      />,
    );

    assert.equal(screen.queryByText('Weight (lbs)', { exact: true }), null);
    assert.ok(screen.getByText('Reps', { exact: true }));

    // Weight is not rendered for bodyweight exercises, so the blank value is
    // verified through the ordinary reps variant's user-visible blur behavior.
    cleanup();
    render(
      <SetFields
        bodyweight={false}
        exerciseType="Sets of Reps"
        onDecrement={() => undefined}
        onIncrement={() => undefined}
        onUpdate={(field, value) => updates.push([field, value])}
        set={{ ...baseSet, weight: '' }}
      />,
    );
    fireEvent.blur(screen.getByRole('textbox'));

    assert.deepEqual(updates, [['weight', '0']]);
  });
});
