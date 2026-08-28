import assert from 'node:assert/strict';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { Injury } from '../../src/types/user';

const user = { uid: 'settings-injuries-test-user' };
let records: Array<{ id: string; data: Injury }> = [];
let loadError: Error | null = null;
let holdLoad = false;
let resolveLoad: (() => void) | null = null;
const creates: Injury[] = [];
const updates: Injury[] = [];
const softDeletes: Array<{ uid: string; id: string }> = [];

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({
    user,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => undefined,
    signUp: async () => undefined,
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => undefined,
  }),
}));

mock.module(new URL('../../src/data/injury-repository.web.ts', import.meta.url).pathname, () => ({
  injuryRepository: {
    getAll: async () => {
      if (holdLoad) await new Promise<void>((resolve) => { resolveLoad = resolve; });
      if (loadError) throw loadError;
      return records;
    },
    create: async (_uid: string, injury: Injury) => {
      creates.push(injury);
    },
    update: async (_uid: string, injury: Injury) => {
      updates.push(injury);
    },
    softDelete: async (uid: string, id: string) => {
      softDeletes.push({ uid, id });
    },
  },
}));

mock.module(new URL('../../src/data/sync-trigger.ts', import.meta.url).pathname, () => ({
  triggerSyncAfterWrite: () => undefined,
}));

mock.module(new URL('../../src/lib/injuries.ts', import.meta.url).pathname, () => ({
  applyInjuryToHistory: async () => 0,
  removeInjuryFromHistory: async () => 0,
}));

mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({ value, placeholder }: { value: string; placeholder?: string }) => (
    <button aria-label={placeholder}>{value || placeholder}</button>
  ),
}));

mock.module(new URL('../../src/ui/primitives/date-field.tsx', import.meta.url).pathname, () => ({
  DateField: ({ value }: { value: Date }) => <input type="date" value={value.toISOString().split('T')[0]} readOnly />,
}));

mock.module(new URL('../../src/ui/primitives/toast.tsx', import.meta.url).pathname, () => ({
  Toast: ({ visible, message }: { visible: boolean; message: string }) =>
    visible ? <span role="alert">{message}</span> : null,
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('expo-router', () => ({
  router: { back: () => undefined },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const { default: SettingsInjuriesScreen } = await import('../../app/settings-injuries');

function injury(overrides: Partial<Injury> = {}): Injury {
  return {
    id: 'injury-1',
    bodyPart: 'shoulder',
    severity: 'moderate',
    status: 'ongoing',
    onsetDate: '2026-08-20T12:00:00.000Z',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderLoaded(): Promise<void> {
  render(<SettingsInjuriesScreen />);
  await waitFor(() => assert.ok(screen.getByText('No ongoing injuries.')));
}

beforeEach(() => {
  records = [];
  loadError = null;
  holdLoad = false;
  resolveLoad = null;
  creates.length = 0;
  updates.length = 0;
  softDeletes.length = 0;
});

afterEach(() => {
  cleanup();
  resolveLoad?.();
  resolveLoad = null;
  holdLoad = false;
});

describe('SettingsInjuriesScreen', () => {
  it('renders the loading baseline until injury records resolve', async () => {
    holdLoad = true;
    render(<SettingsInjuriesScreen />);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('No ongoing injuries.'), null);

    await act(async () => {
      resolveLoad?.();
      resolveLoad = null;
      holdLoad = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No ongoing injuries.')));
  });

  it('renders empty ongoing and past sections plus the add-injury action', async () => {
    await renderLoaded();

    assert.ok(screen.getByText('Injuries'));
    assert.ok(screen.getByText('No ongoing injuries.'));
    assert.ok(screen.getByText('No past injuries.'));
    assert.ok(screen.getByText('Add injury'));
    assert.ok(screen.getByText('Add Injury'));
  });

  it('renders populated ongoing and past injury cards', async () => {
    const ongoing = injury({ id: 'ongoing-shoulder', side: 'left', notes: 'Avoid pressing overhead' });
    const past = injury({
      id: 'past-knee',
      bodyPart: 'knee',
      severity: 'mild',
      status: 'resolved',
      resolvedDate: '2026-08-25T12:00:00.000Z',
    });
    records = [{ id: ongoing.id, data: ongoing }, { id: past.id, data: past }];
    render(<SettingsInjuriesScreen />);
    await waitFor(() => assert.ok(screen.getByText('Shoulder (Left)')));

    assert.ok(screen.getAllByText('Moderate').length >= 1);
    assert.ok(screen.getByText('Avoid pressing overhead'));
    assert.ok(screen.getByText('Knee'));
    assert.ok(screen.getByText('Mild'));
    assert.ok(screen.getAllByText('Apply to history').length >= 1);
    assert.ok(screen.getAllByText('Resolve').length >= 1);
  });

  it('clears loading and preserves the editable baseline after a repository error', async () => {
    loadError = new Error('offline');
    render(<SettingsInjuriesScreen />);
    await settle();

    assert.ok(screen.getByText('No ongoing injuries.'));
    assert.ok(screen.getByText('No past injuries.'));
    assert.ok(screen.getByText('Add Injury'));
  });

  it('creates an injury when the primary Add Injury action is pressed', async () => {
    await renderLoaded();

    await act(async () => {
      screen.getByText('Add Injury').click();
      await Promise.resolve();
    });

    await waitFor(() => assert.equal(creates.length, 1));
    assert.equal(creates[0]?.bodyPart, 'shoulder');
    assert.equal(creates[0]?.severity, 'moderate');
    assert.equal(creates[0]?.status, 'ongoing');
    assert.equal(softDeletes.length, 0);
  });

  it('reconciles valid existing records without deleting them on an unrelated add', async () => {
    const existing = injury({ id: 'existing-shoulder' });
    records = [{ id: existing.id, data: existing }];
    render(<SettingsInjuriesScreen />);
    await waitFor(() => assert.ok(screen.getByText('Apply to history')));

    await act(async () => {
      screen.getByText('Add Injury').click();
      await Promise.resolve();
    });

    await waitFor(() => {
      assert.equal(creates.length, 1);
      assert.deepEqual(updates, [existing]);
      assert.deepEqual(softDeletes, []);
    });
  });

  it('soft-deletes a legacy or unknown body-part record during the next persist', async () => {
    const legacy = injury({ id: 'legacy-body-part' });
    const invalid = { ...legacy, bodyPart: 'upper-arm' } as unknown as Injury;
    records = [{ id: invalid.id, data: invalid }];
    render(<SettingsInjuriesScreen />);
    await waitFor(() => assert.ok(screen.getByText('No ongoing injuries.')));

    await act(async () => {
      screen.getByText('Add Injury').click();
      await Promise.resolve();
    });

    // BUG: load filters unknown body parts from the UI, then persist diffs the
    // filtered list against the raw DB records and soft-deletes the hidden row.
    await waitFor(() => assert.deepEqual(softDeletes, [{ uid: user.uid, id: 'legacy-body-part' }]));
  });
});
