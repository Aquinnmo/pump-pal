import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import type { ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

type DatePickerProps = {
  onChange?: (event: { type: 'set' | 'dismissed' }, date?: Date) => void;
  value: Date;
};

let platform: 'android' | 'web' = 'android';

function TouchableOpacity({ children, onPress }: { children?: ReactNode; onPress?: () => void }) {
  return <button type="button" onClick={onPress}>{children}</button>;
}

function Text({ children }: { children?: ReactNode }) {
  return <span>{children}</span>;
}

function DateTimePicker({ onChange, value }: DatePickerProps) {
  return (
    <div role="dialog" aria-label="Choose date">
      <p>Selected date: {value.toLocaleDateString()}</p>
      <button
        type="button"
        onClick={() => onChange?.({ type: 'set' }, new Date('2025-01-15T12:00:00'))}
      >
        Select January 15, 2025
      </button>
      <button type="button" onClick={() => onChange?.({ type: 'dismissed' })}>
        Cancel
      </button>
    </div>
  );
}

// Register DOM-compatible native surfaces after the mobile preload's default
// react-native-web mapping. The component remains the production source under test.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'date-field-test-doubles',
  setup(build: Build) {
    build.module('react-native', () => ({
      exports: {
        Platform: { get OS() { return platform; } },
        StyleSheet: { create: <T extends Record<string, unknown>>(styles: T) => styles },
        Text,
        TouchableOpacity,
      },
      loader: 'object',
    }));
    build.module('@react-native-community/datetimepicker', () => ({
      exports: { default: DateTimePicker },
      loader: 'object',
    }));
  },
});

const { DateField } = await import('../../src/ui/primitives/date-field');
const selectedDate = new Date('2024-06-20T12:00:00');

afterEach(() => {
  cleanup();
  platform = 'android';
});

describe('DateField', () => {
  it('starts closed, then opens an accessible picker from its visible date button', () => {
    render(<DateField value={selectedDate} onChange={() => undefined} />);

    const dateButton = screen.getByRole('button', { name: selectedDate.toLocaleDateString() });
    assert.ok(dateButton);
    assert.equal(screen.queryByRole('dialog', { name: 'Choose date' }), null);

    fireEvent.click(dateButton);

    assert.ok(screen.getByRole('dialog', { name: 'Choose date' }));
    assert.ok(screen.getByRole('button', { name: 'Select January 15, 2025' }));
  });

  it('reports a selected date exactly once and closes the picker', () => {
    const changes: Date[] = [];
    render(<DateField value={selectedDate} onChange={(date) => changes.push(date)} />);

    fireEvent.click(screen.getByRole('button', { name: selectedDate.toLocaleDateString() }));
    fireEvent.click(screen.getByRole('button', { name: 'Select January 15, 2025' }));

    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.toISOString(), new Date(2025, 0, 15, 12).toISOString());
    assert.equal(screen.queryByRole('dialog', { name: 'Choose date' }), null);
  });

  it('dismisses without selecting or calling onChange', () => {
    const changes: Date[] = [];
    render(<DateField value={selectedDate} onChange={(date) => changes.push(date)} />);

    fireEvent.click(screen.getByRole('button', { name: selectedDate.toLocaleDateString() }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    assert.deepEqual(changes, []);
    assert.equal(screen.queryByRole('dialog', { name: 'Choose date' }), null);
  });

  it('renders an accessible date input and ignores an empty selection on web', () => {
    platform = 'web';
    const changes: Date[] = [];
    render(<DateField value={selectedDate} onChange={(date) => changes.push(date)} />);

    const input = screen.getByDisplayValue('2024-06-20');
    assert.equal(input.getAttribute('type'), 'date');
    assert.equal((input as HTMLInputElement).value, '2024-06-20');

    fireEvent.change(input, { target: { value: '' } });

    assert.deepEqual(changes, []);
  });

  it('reports a non-empty web date input exactly once', () => {
    platform = 'web';
    const changes: Date[] = [];
    render(<DateField value={selectedDate} onChange={(date) => changes.push(date)} />);

    fireEvent.change(screen.getByDisplayValue('2024-06-20'), { target: { value: '2025-01-15' } });

    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.toISOString(), new Date(2025, 0, 15, 12).toISOString());
  });
});
