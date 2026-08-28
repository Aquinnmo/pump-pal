import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useState, type ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';

const user = { uid: 'settings-split-test-user' };
let profileData: UserDoc = { username: 'Test User' };
let profileError: Error | null = null;
let upsertError: Error | null = null;
let holdProfile = false;
let releaseProfile: (() => void) | null = null;
const upserts: Array<{ uid: string; data: UserDoc }> = [];
const syncCalls: string[] = [];
const backCalls: string[] = [];

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

mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => {
      if (holdProfile) await new Promise<void>((resolve) => { releaseProfile = resolve; });
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
      if (upsertError) throw upsertError;
      upserts.push({ uid, data });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/sync-trigger.web.ts', import.meta.url).pathname, () => ({
  triggerSyncAfterWrite: () => syncCalls.push('trigger-sync'),
}));

mock.module(new URL('../../src/lib/alert.ts', import.meta.url).pathname, () => ({
  showAlert: () => undefined,
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

mock.module(new URL('../../src/ui/primitives/toast.tsx', import.meta.url).pathname, () => ({
  Toast: ({ visible, message }: { visible: boolean; message: string }) =>
    visible ? <span role="alert">{message}</span> : null,
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
        <button aria-label={placeholder} onClick={() => setOpen((current) => !current)}>
          {value || placeholder}
        </button>
        {open ? options.map((option) => (
          <button
            key={option}
            role="radio"
            aria-label={option}
            onClick={() => {
              onSelect(option);
              setOpen(false);
            }}
          >
            {option}
          </button>
        )) : null}
      </div>
    );
  },
}));

const { default: SettingsSplitScreen } = await import('../../app/settings-split');
const { router: testRouter } = await import('expo-router') as unknown as {
  router: { back: () => void };
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
    fireEvent.click(screen.getByText('Save Split', { exact: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  profileData = { username: 'Test User' };
  profileError = null;
  upsertError = null;
  holdProfile = false;
  releaseProfile = null;
  upserts.length = 0;
  syncCalls.length = 0;
  backCalls.length = 0;
  testRouter.back = () => backCalls.push('back');
});

afterEach(() => {
  cleanup();
  releaseProfile?.();
  releaseProfile = null;
  holdProfile = false;
});

describe('SettingsSplitScreen', () => {
  it('shows the loading state, then loads the current split from the profile', async () => {
    holdProfile = true;
    profileData = {
      username: 'Test User',
      workoutSplit: {
        type: 'Upper / Lower',
        custom: null,
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
    };
    render(<SettingsSplitScreen />);

    assert.ok(screen.getByText('Split', { exact: true }));
    assert.ok(screen.getByText('Workout Split', { exact: true }));
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.getByRole('button', { name: 'Select Your Split' }).textContent, 'Push / Pull / Legs');

    await act(async () => {
      releaseProfile?.();
      releaseProfile = null;
      holdProfile = false;
    });
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Select Your Split' }).textContent, 'Upper / Lower'));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('keeps the editable default when the current profile read fails', async () => {
    profileError = new Error('offline');
    render(<SettingsSplitScreen />);
    await settle();

    assert.equal(screen.getByRole('button', { name: 'Select Your Split' }).textContent, 'Push / Pull / Legs');
    assert.ok(screen.getByText('Save Split', { exact: true }));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('persists a selected split, shows success, and supports visible back navigation', async () => {
    profileData = { username: 'Test User', aiEnabled: true };
    render(<SettingsSplitScreen />);
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Select Your Split' }).textContent, 'Push / Pull / Legs'));

    choose('Upper / Lower');
    assert.equal(screen.getByRole('button', { name: 'Select Your Split' }).textContent, 'Upper / Lower');
    await save();

    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.equal(screen.getByRole('alert').textContent, 'Workout split updated');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.uid, user.uid);
    assert.equal(upserts[0]?.data.username, 'Test User');
    assert.equal(upserts[0]?.data.aiEnabled, true);
    assert.deepEqual(upserts[0]?.data.workoutSplit?.type, 'Upper / Lower');
    assert.equal(upserts[0]?.data.workoutSplit?.custom, null);
    assert.equal(typeof upserts[0]?.data.workoutSplit?.updatedAt, 'string');
    assert.deepEqual(syncCalls, ['trigger-sync']);

    fireEvent.click(screen.getByLabelText('arrow-back icon'));
    assert.deepEqual(backCalls, ['back']);
  });

  it('shows a user-visible save error and does not persist or navigate', async () => {
    upsertError = new Error('offline');
    render(<SettingsSplitScreen />);
    await waitFor(() => assert.ok(screen.getByText('Save Split', { exact: true })));
    choose('Bro Split');
    await save();

    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.equal(screen.getByRole('alert').textContent, 'Could not save split');
    assert.deepEqual(upserts, []);
    assert.deepEqual(syncCalls, []);
    assert.deepEqual(backCalls, []);
  });
});
