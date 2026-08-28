import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';
import { ApiValidationError } from '../../src/lib/api-client-core';

const user = { uid: 'set-username-test-user' };
let authUser: typeof user & { displayName?: string } | null = { ...user, displayName: 'Jane Doe' };
let profileData: UserDoc = {
  aiEnabled: true,
  workoutSplit: { type: 'Upper / Lower', custom: null, updatedAt: '2026-08-27T00:00:00.000Z' },
};
let patchError: Error | null = null;
let holdPatch = false;
let releasePatch: (() => void) | null = null;
let patchCalls: Array<{ username: string }> = [];
let upserts: Array<{ uid: string; data: UserDoc; options?: Record<string, unknown> }> = [];
let updateProfileCalls: Array<{ user: unknown; changes: { displayName: string } }> = [];
let bumps: string[] = [];
let accountDataChanges: string[] = [];
let alerts: Array<{ title: string; message?: string }> = [];
let replacements: unknown[] = [];

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

mock.module(new URL('../../src/data/remote/profile.ts', import.meta.url).pathname, () => ({
  patchProfile: async (input: { username: string }) => {
    patchCalls.push(input);
    if (holdPatch) await new Promise<void>((resolve) => { releasePatch = resolve; });
    if (patchError) throw patchError;
    return { username: input.username, version: 'profile-v2' };
  },
}));

mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => ({
      id: 'profile',
      data: profileData,
      syncState: 'synced' as const,
      serverVersion: 'profile-v1',
      updatedAt: '2026-08-27T00:00:00.000Z',
      deleted: false,
    }),
    upsert: async (uid: string, data: UserDoc, options?: Record<string, unknown>) => {
      upserts.push({ uid, data, options });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/data-version.ts', import.meta.url).pathname, () => ({
  bumpDataVersion: () => bumps.push('bump'),
}));

mock.module(new URL('../../src/data/initial-sync.ts', import.meta.url).pathname, () => ({
  notifyAccountDataChanged: () => accountDataChanges.push('changed'),
}));

mock.module(new URL('../../src/lib/alert.ts', import.meta.url).pathname, () => ({
  showAlert: (title: string, message?: string) => alerts.push({ title, message }),
}));

mock.module('firebase/auth', () => ({
  updateProfile: async (currentUser: unknown, changes: { displayName: string }) => {
    updateProfileCalls.push({ user: currentUser, changes });
  },
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

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('expo-router', () => ({
  router: { replace: (href: unknown) => replacements.push(href) },
}));

const { default: SetUsernameScreen } = await import('../../app/set-username');
const { router: testRouter } = await import('expo-router') as unknown as {
  router: { replace: (href: unknown) => void };
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function usernameInput(): HTMLInputElement {
  return screen.getByPlaceholderText('Username') as HTMLInputElement;
}

function enterUsername(value: string): void {
  fireEvent.change(usernameInput(), { target: { value } });
}

function pressContinue(): void {
  fireEvent.click(screen.getByLabelText('Save username'));
}

beforeEach(() => {
  authUser = { ...user, displayName: 'Jane Doe' };
  profileData = {
    aiEnabled: true,
    workoutSplit: { type: 'Upper / Lower', custom: null, updatedAt: '2026-08-27T00:00:00.000Z' },
  };
  patchError = null;
  holdPatch = false;
  releasePatch = null;
  patchCalls = [];
  upserts = [];
  updateProfileCalls = [];
  bumps = [];
  accountDataChanges = [];
  alerts = [];
  replacements = [];
  testRouter.replace = (href) => replacements.push(href);
});

afterEach(() => {
  cleanup();
  releasePatch?.();
  releasePatch = null;
  holdPatch = false;
});

describe('SetUsernameScreen', () => {
  it('renders the onboarding copy and initializes the current value from the user display name', async () => {
    render(<SetUsernameScreen />);

    assert.ok(screen.getByText('Pick a username'));
    assert.ok(screen.getByText('Claim your username'));
    assert.ok(screen.getByText('This is how other lifters will find and see you.'));
    await waitFor(() => assert.equal(usernameInput().value, 'jane_doe'));
    assert.ok(screen.getByText('Continue'));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('shows format validation without entering the persistence boundary', async () => {
    render(<SetUsernameScreen />);
    enterUsername('ab');
    pressContinue();
    await settle();

    assert.ok(screen.getByText('3-20 characters: letters, digits, underscore, starting with a letter.'));
    assert.deepEqual(patchCalls, []);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
  });

  it('shows saving state and blocks duplicate presses while the remote save is pending', async () => {
    holdPatch = true;
    render(<SetUsernameScreen />);
    enterUsername('new_name');
    pressContinue();
    await settle();

    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.getByLabelText('Save username').getAttribute('aria-disabled'), 'true');
    pressContinue();
    assert.deepEqual(patchCalls, [{ username: 'new_name' }]);
    assert.deepEqual(replacements, []);

    await act(async () => {
      releasePatch?.();
      releasePatch = null;
      holdPatch = false;
    });
    await waitFor(() => assert.deepEqual(replacements, ['/']));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('persists a valid username, merges the local profile, updates auth when needed, and routes home', async () => {
    authUser = { ...user };
    render(<SetUsernameScreen />);
    enterUsername('  New_Name  ');
    pressContinue();

    await waitFor(() => assert.deepEqual(replacements, ['/']));
    assert.deepEqual(patchCalls, [{ username: 'New_Name' }]);
    assert.deepEqual(upserts, [{
      uid: user.uid,
      data: {
        aiEnabled: true,
        workoutSplit: { type: 'Upper / Lower', custom: null, updatedAt: '2026-08-27T00:00:00.000Z' },
        username: 'New_Name',
        usernameLower: 'new_name',
      },
      options: { syncState: 'synced', serverVersion: 'profile-v2' },
    }]);
    assert.deepEqual(bumps, ['bump']);
    assert.deepEqual(accountDataChanges, ['changed']);
    assert.deepEqual(updateProfileCalls, [{ user: authUser, changes: { displayName: 'New_Name' } }]);
    assert.deepEqual(alerts, []);
  });

  it('reports a username-taken validation error without writing or navigating', async () => {
    patchError = new ApiValidationError('taken', 'username_taken');
    render(<SetUsernameScreen />);
    enterUsername('new_name');
    pressContinue();

    await waitFor(() => assert.ok(screen.getByText('That username is taken. Try another.')));
    assert.deepEqual(patchCalls, [{ username: 'new_name' }]);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
    assert.deepEqual(alerts, []);
  });

  it('shows a generic save failure and leaves the screen available for retry', async () => {
    patchError = new Error('offline');
    render(<SetUsernameScreen />);
    enterUsername('new_name');
    pressContinue();

    await waitFor(() => assert.deepEqual(alerts, [{ title: 'Error', message: 'Could not save your username. Please try again.' }]));
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText('Continue'));
  });
});
