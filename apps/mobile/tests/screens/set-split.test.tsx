import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useState, type ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';

const user = { uid: 'set-split-test-user' };
let authUser: typeof user | null = user;
let profileData: UserDoc = { username: 'Test User', aiEnabled: true };
let profileError: Error | null = null;
let upsertError: Error | null = null;
let holdUpsert = false;
let releaseUpsert: (() => void) | null = null;
const upserts: Array<{ uid: string; data: UserDoc }> = [];
const alerts: Array<{ title: string; message?: string }> = [];
const syncCalls: string[] = [];
const replacements: unknown[] = [];

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({
    user: authUser,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => undefined,
    signUp: async () => undefined,
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => undefined,
  }),
}));

mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => {
      if (profileError) throw profileError;
      return {
        id: 'profile',
        data: profileData,
        syncState: 'synced' as const,
        serverVersion: null,
        updatedAt: '2026-08-27T00:00:00.000Z',
        deleted: false,
      };
    },
    upsert: async (uid: string, data: UserDoc) => {
      if (holdUpsert) await new Promise<void>((resolve) => { releaseUpsert = resolve; });
      if (upsertError) throw upsertError;
      upserts.push({ uid, data });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/sync-trigger.web.ts', import.meta.url).pathname, () => ({
  triggerSyncAfterWrite: () => syncCalls.push('trigger-sync'),
}));

mock.module(new URL('../../src/data/initial-sync.ts', import.meta.url).pathname, () => ({
  notifyAccountDataChanged: () => syncCalls.push('account-data-changed'),
}));

mock.module(new URL('../../src/lib/alert.ts', import.meta.url).pathname, () => ({
  showAlert: (title: string, message?: string) => alerts.push({ title, message }),
}));

mock.module(new URL('../../src/ui/timber-auth-shell.tsx', import.meta.url).pathname, () => ({
  TimberAuthShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TimberBrand: ({ eyebrow, subtitle }: { eyebrow?: string; subtitle?: string }) => (
    <div>
      {eyebrow ? <span>{eyebrow}</span> : null}
      <span>Timber</span>
      {subtitle ? <span>{subtitle}</span> : null}
    </div>
  ),
  timberAuthStyles: {
    field: {},
    primaryButton: {},
    primaryButtonText: {},
  },
}));

mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({
    options,
    value,
    onSelect,
    placeholder,
  }: {
    options: readonly string[];
    value: string | null;
    onSelect: (value: string) => void;
    placeholder?: string;
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button aria-label={placeholder} onClick={() => setOpen((current) => !current)}>{value || placeholder}</button>
        {open ? options.map((option) => (
          <button key={option} role="radio" aria-label={option} onClick={() => { onSelect(option); setOpen(false); }}>
            {option}
          </button>
        )) : null}
      </div>
    );
  },
}));

const { default: SetSplitScreen } = await import('../../app/set-split');
const { router: testRouter } = await import('expo-router') as unknown as {
  router: { replace: (href: unknown) => void };
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function openChoices(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Select Your Split' }));
}

function choose(option: string): void {
  openChoices();
  fireEvent.click(screen.getByRole('radio', { name: option }));
}

async function save(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Save workout split'));
    await Promise.resolve();
  });
}

beforeEach(() => {
  authUser = user;
  profileData = { username: 'Test User', aiEnabled: true };
  profileError = null;
  upsertError = null;
  holdUpsert = false;
  releaseUpsert = null;
  upserts.length = 0;
  alerts.length = 0;
  syncCalls.length = 0;
  replacements.length = 0;
  testRouter.replace = (href) => replacements.push(href);
});

afterEach(() => {
  cleanup();
  releaseUpsert?.();
  releaseUpsert = null;
  holdUpsert = false;
});

describe('SetSplitScreen', () => {
  it('renders the empty custom-split baseline and rejects an empty Other description', async () => {
    render(<SetSplitScreen />);
    assert.ok(screen.getByText('One last thing'));
    assert.ok(screen.getByText('Set your training roots'));
    assert.ok(screen.getByText('Choose the split you use most. You can still plan or log any workout you want.'));
    assert.ok(screen.getByText('Push / Pull / Legs'));

    choose('Other');
    assert.ok(screen.getByPlaceholderText('Describe your split'));
    await save();

    assert.deepEqual(alerts, [{ title: 'Missing split', message: 'Please describe your split to continue.' }]);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
  });

  it('renders every populated split choice and shows the custom field only for Other', async () => {
    render(<SetSplitScreen />);
    openChoices();

    for (const option of ['Push / Pull / Legs', 'Upper / Lower', 'Bro Split', 'Full Body', 'Other']) {
      assert.ok(screen.getByRole('radio', { name: option }));
    }

    fireEvent.click(screen.getByRole('radio', { name: 'Upper / Lower' }));
    assert.ok(screen.getByText('Upper / Lower'));
    assert.equal(screen.queryByPlaceholderText('Describe your split'), null);
    choose('Other');
    assert.ok(screen.getByPlaceholderText('Describe your split'));
  });

  it('saves a selected split by merging the profile, notifying sync, and navigating to tabs', async () => {
    render(<SetSplitScreen />);
    choose('Upper / Lower');
    await save();

    await waitFor(() => assert.deepEqual(replacements, ['/(tabs)']));
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.uid, user.uid);
    assert.equal(upserts[0]?.data.username, 'Test User');
    assert.equal(upserts[0]?.data.aiEnabled, true);
    assert.deepEqual(upserts[0]?.data.workoutSplit?.type, 'Upper / Lower');
    assert.equal(upserts[0]?.data.workoutSplit?.custom, null);
    assert.equal(typeof upserts[0]?.data.workoutSplit?.updatedAt, 'string');
    assert.deepEqual(syncCalls, ['trigger-sync', 'account-data-changed']);
  });

  it('trims and persists a custom Other split', async () => {
    render(<SetSplitScreen />);
    choose('Other');
    fireEvent.change(screen.getByPlaceholderText('Describe your split'), { target: { value: '  Chest / Back  ' } });
    await save();

    await waitFor(() => assert.equal(upserts.length, 1));
    assert.deepEqual(upserts[0]?.data.workoutSplit, {
      type: 'Other',
      custom: 'Chest / Back',
      updatedAt: upserts[0]?.data.workoutSplit?.updatedAt,
    });
    assert.deepEqual(replacements, ['/(tabs)']);
  });

  it('shows saving state and blocks the primary action while the profile save is pending', async () => {
    holdUpsert = true;
    render(<SetSplitScreen />);
    await save();

    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.getByLabelText('Save workout split').getAttribute('aria-disabled'), 'true');
    assert.deepEqual(replacements, []);
    assert.equal(upserts.length, 0);

    await act(async () => {
      releaseUpsert?.();
      releaseUpsert = null;
      holdUpsert = false;
    });
    await waitFor(() => assert.deepEqual(replacements, ['/(tabs)']));
    assert.equal(upserts.length, 1);
  });

  it('shows a save error without navigating and clears saving after the repository fails', async () => {
    upsertError = new Error('offline');
    render(<SetSplitScreen />);
    await save();

    assert.deepEqual(alerts, [{ title: 'Error', message: 'Could not save your split. Please try again.' }]);
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText('Save My Split'));
  });

  it('shows a profile-read error without attempting an upsert', async () => {
    profileError = new Error('offline');
    render(<SetSplitScreen />);
    await save();

    assert.deepEqual(alerts, [{ title: 'Error', message: 'Could not save your split. Please try again.' }]);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
  });
});
