import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { Injury } from '../../src/types/user';

const user = { uid: 'settings-injuries-test-user' };
let records: Array<{ id: string; data: Injury }> = [];
let loadError: Error | null = null;
let failCreate: Error | null = null;
let failUpdate: Error | null = null;
let failDelete: Error | null = null;
let historyCount = 2;
const creates: Injury[] = [];
const updates: Injury[] = [];
const softDeletes: Array<{ uid: string; id: string }> = [];
const historyApplies: string[] = [];
const historyRemovals: string[] = [];

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({ user, loading: false, googleConnection: 'disconnected', signIn: async () => undefined, signUp: async () => undefined, signInWithGoogle: async () => undefined, connectGoogleAccount: async () => false, logOut: async () => undefined }),
}));

mock.module(new URL('../../src/data/injury-repository.web.ts', import.meta.url).pathname, () => ({
  injuryRepository: {
    getAll: async () => { if (loadError) throw loadError; return records; },
    create: async (_uid: string, injury: Injury) => { if (failCreate) throw failCreate; creates.push(injury); },
    update: async (_uid: string, injury: Injury) => { if (failUpdate) throw failUpdate; updates.push(injury); },
    softDelete: async (uid: string, id: string) => { if (failDelete) throw failDelete; softDeletes.push({ uid, id }); },
  },
}));

mock.module(new URL('../../src/data/sync-trigger.ts', import.meta.url).pathname, () => ({ triggerSyncAfterWrite: () => undefined }));
mock.module(new URL('../../src/lib/injuries.web.ts', import.meta.url).pathname, () => ({
  applyInjuryToHistory: async (uid: string, injury: Injury) => { historyApplies.push(`${uid}:${injury.id}`); return historyCount; },
  removeInjuryFromHistory: async (uid: string, id: string) => { historyRemovals.push(`${uid}:${id}`); return historyCount; },
}));

mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({ options, value, placeholder, onSelect, accessibilityLabel }: { options: string[]; value: string | null; placeholder?: string; onSelect: (value: string) => void; accessibilityLabel?: string }) => (
    <select aria-label={accessibilityLabel ?? placeholder} value={value ?? ''} onChange={(event) => onSelect(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  ),
}));

mock.module(new URL('../../src/ui/primitives/date-field.tsx', import.meta.url).pathname, () => ({
  DateField: ({ value, onChange }: { value: Date; onChange: (date: Date) => void }) => <input aria-label="Date" type="date" value={value.toISOString().slice(0, 10)} onChange={(event) => onChange(new Date(`${event.target.value}T12:00:00`))} />,
}));
mock.module(new URL('../../src/ui/primitives/toast.tsx', import.meta.url).pathname, () => ({ Toast: ({ visible, message }: { visible: boolean; message: string }) => visible ? <span role="alert">{message}</span> : null }));
mock.module('@expo/vector-icons', () => ({ Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} /> }));
mock.module('expo-router', () => ({ router: { back: () => undefined } }));
mock.module('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const { default: SettingsInjuriesScreen } = await import('../../app/settings-injuries');

function injury(overrides: Partial<Injury> = {}): Injury {
  return { id: 'injury-1', bodyPart: 'shoulder', severity: 'moderate', status: 'ongoing', onsetDate: '2026-08-20T12:00:00.000Z', createdAt: '2026-08-20T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z', ...overrides };
}

async function loaded() {
  render(<SettingsInjuriesScreen />);
  await waitFor(() => assert.ok(screen.getByText('Current injuries')));
}

async function press(element: Element | null | undefined) {
  assert.ok(element);
  await act(async () => {});
  fireEvent.click(element);
}

beforeEach(() => {
  records = [];
  loadError = null;
  failCreate = null;
  failUpdate = null;
  failDelete = null;
  historyCount = 2;
  creates.length = 0;
  updates.length = 0;
  softDeletes.length = 0;
  historyApplies.length = 0;
  historyRemovals.length = 0;
});

afterEach(() => cleanup());

describe('SettingsInjuriesScreen', () => {
  it('shows current injuries first and keeps past injuries collapsed until opened', async () => {
    const current = injury({ id: 'current' });
    const past = injury({ id: 'past', bodyPart: 'knee', status: 'resolved', resolvedDate: '2026-08-25T12:00:00.000Z' });
    records = [{ id: current.id, data: current }, { id: past.id, data: past }];
    await loaded();

    assert.ok(screen.getByRole('button', { name: /Shoulder, Not specified, Moderate/ }));
    assert.equal(screen.queryByRole('button', { name: /Knee, Not specified/ }), null);
    await press(screen.getByText('Past injuries'));
    assert.ok(screen.getByRole('button', { name: /Knee, Not specified/ }));
  });

  it('opens a focused detail view and returns to the list', async () => {
    const current = injury({ id: 'current', side: 'left', avoid: ['dips'], notes: 'Keep it light' });
    records = [{ id: current.id, data: current }];
    await loaded();
    await press(screen.getByRole('button', { name: /Shoulder, Left, Moderate/ }));

    assert.ok(screen.getByText('Injury details'));
    assert.ok(screen.getByText('Keep it light'));
    assert.ok(screen.getByText('dips'));
    assert.ok(screen.getByText('Edit injury'));
    assert.ok(screen.getByText('Mark as ended'));
    await press(screen.getByLabelText('Back'));
    assert.ok(screen.getByText('Current injuries'));
  });

  it('requires an explicit body part, then saves a new injury with visible defaults', async () => {
    await loaded();
    await press(screen.getByText('Add injury'));
    await press(screen.getByText('Save injury'));
    assert.match(screen.getByRole('alert').textContent ?? '', /Choose a body part/);
    assert.equal(creates.length, 0);

    fireEvent.change(screen.getByLabelText('Body part'), { target: { value: 'Shoulder' } });
    await press(screen.getByText('Save injury'));
    await waitFor(() => assert.equal(creates.length, 1));
    assert.equal(creates[0]?.bodyPart, 'shoulder');
    assert.equal(creates[0]?.severity, 'moderate');
    assert.equal(creates[0]?.status, 'ongoing');
    assert.ok(screen.getByText('Injury details'));
  });

  it('round-trips editable fields while preserving identity and muscle metadata', async () => {
    const existing = injury({ id: 'existing', muscles: ['front delts'], side: 'left', avoid: ['press'], notes: 'old note' });
    records = [{ id: existing.id, data: existing }];
    await loaded();
    await press(screen.getByRole('button', { name: /Shoulder, Left, Moderate/ }));
    await press(screen.getByText('Edit injury'));
    fireEvent.change(screen.getByLabelText('Body part'), { target: { value: 'Knee' } });
    fireEvent.change(screen.getByLabelText('Side'), { target: { value: 'Both' } });
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'Severe' } });
    fireEvent.change(screen.getByLabelText('Movements to avoid'), { target: { value: 'squat, lunge' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'new note' } });
    await press(screen.getByText('Save injury'));

    await waitFor(() => assert.equal(updates.length, 1));
    assert.equal(updates[0]?.id, existing.id);
    assert.equal(updates[0]?.createdAt, existing.createdAt);
    assert.deepEqual(updates[0]?.muscles, existing.muscles);
    assert.equal(updates[0]?.bodyPart, 'knee');
    assert.equal(updates[0]?.side, 'both');
    assert.equal(updates[0]?.severity, 'severe');
    assert.deepEqual(updates[0]?.avoid, ['squat', 'lunge']);
    assert.equal(updates[0]?.notes, 'new note');
  });

  it('rejects an ended date before the start date', async () => {
    await loaded();
    await press(screen.getByText('Add injury'));
    fireEvent.change(screen.getByLabelText('Body part'), { target: { value: 'Shoulder' } });
    await press(screen.getByRole('radio', { name: 'Ended' }));
    const dates = screen.getAllByLabelText('Date');
    fireEvent.change(dates[1]!, { target: { value: '2020-01-01' } });
    await press(screen.getByText('Save injury'));
    assert.match(screen.getByRole('alert').textContent ?? '', /cannot be before/);
    assert.equal(creates.length, 0);
  });

  it('offers Keep editing or Discard changes when backing out of a dirty form', async () => {
    await loaded();
    await press(screen.getByText('Add injury'));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'draft' } });
    await press(screen.getByLabelText('Back'));
    assert.ok(screen.getByText('Discard changes'));
    await press(screen.getByText('Keep editing'));
    assert.ok(screen.getByText('Save injury'));
    await press(screen.getByLabelText('Back'));
    await press(screen.getByText('Discard changes'));
    assert.ok(screen.getByText('Current injuries'));
    assert.equal(creates.length, 0);
  });

  it('applies history explicitly with the saved date range and ends an injury without applying history', async () => {
    const existing = injury({ id: 'existing' });
    records = [{ id: existing.id, data: existing }];
    await loaded();
    await press(screen.getByRole('button', { name: /Shoulder, Not specified, Moderate/ }));
    await press(screen.getByText('Mark as ended'));
    await waitFor(() => assert.equal(updates.length, 1));
    assert.equal(historyApplies.length, 0);
    await press(screen.getByText('Add to past workouts'));
    await waitFor(() => assert.equal(historyApplies.length, 1));
    assert.match(screen.getByRole('alert').textContent ?? '', /Added 2 workouts from/);
  });

  it('deletes only after history removal and persistence both succeed', async () => {
    const existing = injury({ id: 'existing' });
    records = [{ id: existing.id, data: existing }];
    await loaded();
    await press(screen.getByRole('button', { name: /Shoulder, Not specified, Moderate/ }));
    await press(screen.getByText('Delete injury'));
    assert.ok(screen.getByText('Keep injury'));
    await press(screen.getAllByText('Delete injury').at(-1));
    await waitFor(() => assert.deepEqual(softDeletes, [{ uid: user.uid, id: existing.id }]));
    assert.deepEqual(historyRemovals, [`${user.uid}:${existing.id}`]);
    assert.match(screen.getByRole('alert').textContent ?? '', /deleted and removed/);
  });

  it('reports load errors with Retry instead of an empty state', async () => {
    loadError = new Error('offline');
    render(<SettingsInjuriesScreen />);
    await waitFor(() => assert.ok(screen.getByText('Could not load injuries.')));
    assert.ok(screen.getByText('Could not load injuries.'));
    assert.equal(screen.queryByText('No current injuries.'), null);
    loadError = null;
    await press(screen.getByText('Retry'));
    await waitFor(() => assert.ok(screen.getByText('No current injuries.')));
  });

  it('preserves hidden legacy records during an unrelated add', async () => {
    const legacy = { ...injury({ id: 'legacy' }), bodyPart: 'upper-arm' } as unknown as Injury;
    records = [{ id: legacy.id, data: legacy }];
    await loaded();
    await press(screen.getByText('Add injury'));
    fireEvent.change(screen.getByLabelText('Body part'), { target: { value: 'Shoulder' } });
    await press(screen.getByText('Save injury'));
    await waitFor(() => assert.equal(creates.length, 1));
    assert.deepEqual(softDeletes, []);
  });

  it('keeps the draft after a save failure and prevents a success message', async () => {
    failCreate = new Error('offline');
    await loaded();
    await press(screen.getByText('Add injury'));
    fireEvent.change(screen.getByLabelText('Body part'), { target: { value: 'Shoulder' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'keep this' } });
    await press(screen.getByText('Save injury'));
    await waitFor(() => assert.match(screen.getByRole('alert').textContent ?? '', /still here/));
    assert.ok(screen.getByDisplayValue('keep this'));
    assert.equal(screen.queryByText('Injury details'), null);
  });
});
