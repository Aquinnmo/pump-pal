import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';

const user = {
  uid: 'settings-account-test-user',
  email: 'test@example.com',
  providerData: [{ providerId: 'password' }],
};

let profileData: UserDoc | null = { username: 'Test User' };
let profileError: Error | null = null;
let holdProfile = false;
let resolveProfile: (() => void) | null = null;
let accountDataError: Error | null = null;
let purgeError: Error | null = null;
let authDeleteError: Error | null = null;
let accountDataResult = {
  deleted: { workouts: 2, legacyWorkouts: 1, pushupChallenge: true, friendships: 1, userDoc: true },
  partial: false,
};
const events: string[] = [];
const replacements: unknown[] = [];

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
      if (holdProfile) await new Promise<void>((resolve) => { resolveProfile = resolve; });
      if (profileError) throw profileError;
      return profileData
        ? {
            id: 'profile',
            data: profileData,
            syncState: 'synced' as const,
            serverVersion: null,
            updatedAt: '2026-08-27T00:00:00.000Z',
            deleted: false,
          }
        : null;
    },
  },
}));

mock.module(new URL('../../src/data/account-data.web.ts', import.meta.url).pathname, () => ({
  countPendingSync: async () => 0,
  syncBeforeSignOut: async () => undefined,
  purgeLocalAccountData: async () => {
    events.push('purge-local');
    if (purgeError) throw purgeError;
  },
}));

mock.module(new URL('../../src/data/remote/account.ts', import.meta.url).pathname, () => ({
  deleteAccountData: async () => {
    events.push('delete-account-data');
    if (accountDataError) throw accountDataError;
    return accountDataResult;
  },
}));

mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  auth: { currentUser: user },
}));

mock.module('firebase/auth', () => ({
  deleteUser: async () => {
    events.push('delete-auth-user');
    if (authDeleteError) throw authDeleteError;
  },
  sendPasswordResetEmail: async () => undefined,
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

mock.module('react-native-reanimated', () => {
  const Animated = {
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  };
  return {
    default: Animated,
    cancelAnimation: () => undefined,
    Easing: { out: (fn: unknown) => fn, quad: (value: number) => value },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

const { default: SettingsAccountScreen } = await import('../../app/settings-account');
const { router: testRouter } = await import('expo-router') as unknown as {
  router: { replace: (href: unknown) => void };
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderLoaded(): Promise<void> {
  render(<SettingsAccountScreen />);
  await waitFor(() => assert.ok(screen.getByText('Username · Test User')));
}

function openDeleteModal(): void {
  fireEvent.click(screen.getByText('Delete Account').parentElement!);
  assert.ok(screen.getByText(/Type your username/));
}

beforeEach(() => {
  profileData = { username: 'Test User' };
  profileError = null;
  holdProfile = false;
  resolveProfile = null;
  accountDataError = null;
  purgeError = null;
  authDeleteError = null;
  accountDataResult = {
    deleted: { workouts: 2, legacyWorkouts: 1, pushupChallenge: true, friendships: 1, userDoc: true },
    partial: false,
  };
  events.length = 0;
  replacements.length = 0;
  testRouter.replace = (href) => replacements.push(href);
});

afterEach(() => {
  cleanup();
  resolveProfile?.();
  resolveProfile = null;
  holdProfile = false;
});

describe('SettingsAccountScreen', () => {
  it('renders the account controls while the profile is loading, then shows the username', async () => {
    holdProfile = true;
    render(<SettingsAccountScreen />);

    assert.ok(screen.getByText('Account'));
    assert.ok(screen.getByText('Username'));
    assert.ok(screen.getByText('Change Password'));
    assert.ok(screen.getByText('Sign Out'));
    assert.ok(screen.getByText('Delete Account'));
    assert.equal(screen.queryByText('Username · Test User'), null);

    await act(async () => {
      resolveProfile?.();
      resolveProfile = null;
      holdProfile = false;
    });
    await waitFor(() => assert.ok(screen.getByText('Username · Test User')));
  });

  it('keeps the editable account baseline when the profile read fails', async () => {
    profileError = new Error('offline');
    render(<SettingsAccountScreen />);
    await settle();

    assert.ok(screen.getByText('Username'));
    assert.ok(screen.getByText('Delete Account'));
    assert.equal(screen.queryByText('Username · Test User'), null);
  });

  it('requires the exact loaded username before attempting deletion', async () => {
    await renderLoaded();
    openDeleteModal();

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton.parentElement!);
    await settle();
    assert.deepEqual(events, []);
    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'test user' } });
    fireEvent.click(deleteButton.parentElement!);
    await settle();
    assert.deepEqual(events, []);

    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'Test User' } });
    fireEvent.click(deleteButton.parentElement!);
    await waitFor(() => assert.deepEqual(events, ['delete-account-data', 'purge-local', 'delete-auth-user']));
  });

  it('does not offer an empty confirmation for an account whose username is null', async () => {
    profileData = { username: null } as unknown as UserDoc;
    render(<SettingsAccountScreen />);
    await waitFor(() => assert.ok(screen.getByText('Username')));
    openDeleteModal();

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton.parentElement!);
    await settle();
    assert.deepEqual(events, []);
  });

  it('deletes server data, then local data, then Firebase Auth and redirects on success', async () => {
    await renderLoaded();
    openDeleteModal();
    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'Test User' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete').parentElement!);
      await Promise.resolve();
    });
    await waitFor(() => assert.deepEqual(replacements, ['/(auth)/sign-in']));

    // The server response includes the legacy users/{uid}/workouts purge count;
    // that purge is owned by the mocked API boundary (and covered by the API
    // account-deletion tests), while this screen locks that boundary's ordering.
    assert.equal(accountDataResult.deleted.legacyWorkouts, 1);
    assert.deepEqual(events, ['delete-account-data', 'purge-local', 'delete-auth-user']);
  });

  it('preserves the current partial-server-response behavior', async () => {
    accountDataResult = { ...accountDataResult, partial: true };
    await renderLoaded();
    openDeleteModal();
    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'Test User' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete').parentElement!);
      await Promise.resolve();
    });
    await waitFor(() => assert.deepEqual(replacements, ['/(auth)/sign-in']));

    // BUG: the server's partial=true response means cleanup failed and is safe
    // to retry, but this screen ignores the envelope and deletes Auth anyway.
    assert.equal(accountDataResult.partial, true);
    assert.deepEqual(events, ['delete-account-data', 'purge-local', 'delete-auth-user']);
  });

  it('keeps the delete modal open and reports a server failure without purging later data', async () => {
    accountDataError = new Error('server unavailable');
    await renderLoaded();
    openDeleteModal();
    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'Test User' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete').parentElement!);
      await Promise.resolve();
    });
    await waitFor(() => assert.ok(screen.getByText('Could not delete account. Please try again.')));
    assert.deepEqual(events, ['delete-account-data']);
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText(/Type your username/));
    assert.ok(screen.getByText('Delete'));
  });

  it('reports a recent-login Auth failure after local purge without redirecting', async () => {
    authDeleteError = Object.assign(new Error('recent login'), { code: 'auth/requires-recent-login' });
    await renderLoaded();
    openDeleteModal();
    fireEvent.change(screen.getByPlaceholderText('Your username'), { target: { value: 'Test User' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete').parentElement!);
      await Promise.resolve();
    });
    await waitFor(() => assert.ok(screen.getByText('Please sign out and sign back in before deleting your account.')));
    assert.deepEqual(events, ['delete-account-data', 'purge-local', 'delete-auth-user']);
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText(/Type your username/));
  });
});
