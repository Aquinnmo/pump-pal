import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';
import { ApiValidationError } from '../../src/lib/api-client-core';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const replacements: string[] = [];
const signUpCalls: Array<[string, string, string]> = [];
const patchCalls: Array<{ username: string }> = [];
const upserts: Array<{ uid: string; data: UserDoc; options?: unknown }> = [];
const versionBumps: string[] = [];
let currentUser: { uid: string } | null = null;
let profileData: UserDoc | null = { aiEnabled: true };
let profileError: Error | null = null;
let patchError: Error | null = null;
let signUpImpl: (email: string, password: string, username: string) => Promise<void> = async () => {
  currentUser = { uid: 'new-user' };
};
let releaseSignUp: (() => void) | null = null;

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({
    user: currentUser,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => undefined,
    signUp: async (email: string, password: string, username: string) => {
      signUpCalls.push([email, password, username]);
      return signUpImpl(email, password, username);
    },
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => undefined,
  }),
}));

mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  auth: {
    get currentUser() {
      return currentUser;
    },
  },
}));

mock.module(new URL('../../src/data/remote/profile.ts', import.meta.url).pathname, () => ({
  patchProfile: async (input: { username: string }) => {
    patchCalls.push(input);
    if (patchError) throw patchError;
    return { username: input.username, version: 'server-v2' };
  },
}));

mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => {
      if (profileError) throw profileError;
      return profileData
        ? {
            id: 'profile',
            data: profileData,
            syncState: 'synced' as const,
            serverVersion: 'server-v1',
            updatedAt: '2026-08-27T00:00:00.000Z',
            deleted: false,
          }
        : null;
    },
    upsert: async (uid: string, data: UserDoc, options?: unknown) => {
      upserts.push({ uid, data, options });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/data-version.ts', import.meta.url).pathname, () => ({
  bumpDataVersion: () => versionBumps.push('bump'),
}));

mock.module(new URL('../../src/ui/timber-auth-shell.tsx', import.meta.url).pathname, () => ({
  TimberAuthShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TimberBrand: () => <div>Timber</div>,
  timberAuthStyles: {
    field: {},
    primaryButton: {},
    primaryButtonText: {},
    errorBanner: {},
  },
}));

mock.module(new URL('../../src/ui/google-sign-in-button.tsx', import.meta.url).pathname, () => ({
  GoogleSignInButton: ({ label, disabled }: { label: string; disabled?: boolean }) => (
    <button aria-label={label} disabled={disabled}>{label}</button>
  ),
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// Keep route changes observable while preserving the link's visible child.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'sign-up-router-test-double',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { replace: (href: string) => replacements.push(href) },
        Link: ({ children }: { children?: ReactNode }) => <>{children}</>,
      },
      loader: 'object',
    }));
  },
});

const { default: SignUpScreen } = await import('../../app/(auth)/sign-up');

function fillForm(username = 'Adam_1', email = 'adam@example.com', password = 'secret') {
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('Password (min 6 characters)'), { target: { value: password } });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  currentUser = null;
  profileData = { aiEnabled: true };
  profileError = null;
  patchError = null;
  signUpCalls.length = 0;
  patchCalls.length = 0;
  upserts.length = 0;
  versionBumps.length = 0;
  replacements.length = 0;
  releaseSignUp = null;
  signUpImpl = async () => {
    currentUser = { uid: 'new-user' };
  };
});

afterEach(() => {
  cleanup();
  releaseSignUp?.();
  releaseSignUp = null;
});

describe('SignUpScreen', () => {
  it('renders the baseline form and available account choices', () => {
    render(<SignUpScreen />);

    assert.ok(screen.getByText('Timber', { exact: true }));
    assert.ok(screen.getByText('Lay Down Your Roots', { exact: true }));
    assert.ok(screen.getByPlaceholderText('Username'));
    assert.ok(screen.getByPlaceholderText('Email'));
    assert.ok(screen.getByPlaceholderText('Password (min 6 characters)'));
    assert.ok(screen.getByLabelText('Create Timber account'));
    assert.ok(screen.getByRole('button', { name: 'Sign up with Google' }));
    assert.ok(screen.getByText('Already logging?', { exact: false }));
    assert.equal(screen.queryByText('Please fill in all fields.', { exact: true }), null);
  });

  it('validates blank and malformed input without starting auth', async () => {
    render(<SignUpScreen />);
    fireEvent.click(screen.getByLabelText('Create Timber account'));
    await settle();

    assert.ok(screen.getByText('Please fill in all fields.', { exact: true }));
    assert.deepEqual(signUpCalls, []);
    assert.deepEqual(replacements, []);

    fillForm('1bad', 'adam@example.com', 'secret');
    fireEvent.click(screen.getByLabelText('Create Timber account'));
    await settle();
    assert.ok(screen.getByText('Username must be 3-20 characters: letters, digits, underscore, starting with a letter.', { exact: true }));
    assert.deepEqual(signUpCalls, []);

    fillForm('Adam_1', 'adam@example.com', 'short');
    fireEvent.click(screen.getByLabelText('Create Timber account'));
    await settle();
    assert.ok(screen.getByText('Password must be at least 6 characters.', { exact: true }));
    assert.deepEqual(signUpCalls, []);
  });

  it('shows pending state and blocks duplicate submission until auth resolves', async () => {
    signUpImpl = () => new Promise<void>((resolve) => {
      releaseSignUp = () => {
        currentUser = { uid: 'new-user' };
        resolve();
      };
    });
    render(<SignUpScreen />);
    fillForm();
    const submit = screen.getByLabelText('Create Timber account');

    fireEvent.click(submit);
    assert.equal(submit.getAttribute('aria-disabled'), 'true');
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.getByRole('button', { name: 'Sign up with Google' }).hasAttribute('disabled'), true);

    fireEvent.click(submit);
    assert.deepEqual(signUpCalls, [['adam@example.com', 'secret', 'Adam_1']]);

    await act(async () => {
      releaseSignUp?.();
      releaseSignUp = null;
    });
    await waitFor(() => assert.deepEqual(replacements, ['/set-split']));
  });

  it('shows a friendly auth error and restores the editable form', async () => {
    signUpImpl = async () => { throw { code: 'auth/email-already-in-use' }; };
    render(<SignUpScreen />);
    fillForm();
    fireEvent.click(screen.getByLabelText('Create Timber account'));

    await waitFor(() => assert.ok(screen.getByText('An account with this email already exists.', { exact: true })));
    assert.deepEqual(patchCalls, []);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText('Create Account', { exact: true }));
  });

  it('maps username conflicts to the user-visible retry message', async () => {
    patchError = new ApiValidationError('taken', 'username_taken');
    render(<SignUpScreen />);
    fillForm();
    fireEvent.click(screen.getByLabelText('Create Timber account'));

    await waitFor(() => assert.ok(screen.getByText('That username is taken. Try another.', { exact: true })));
    assert.deepEqual(signUpCalls, [['adam@example.com', 'secret', 'Adam_1']]);
    assert.deepEqual(upserts, []);
    assert.deepEqual(replacements, []);
  });

  it('trims username/email, preserves password, patches the profile, and routes after success', async () => {
    currentUser = null;
    profileData = { aiEnabled: true, socialEnabled: false };
    render(<SignUpScreen />);
    fillForm('  Adam_1  ', '  adam@example.com  ', ' secret ');
    fireEvent.click(screen.getByLabelText('Create Timber account'));

    await waitFor(() => assert.deepEqual(replacements, ['/set-split']));
    assert.deepEqual(signUpCalls, [['adam@example.com', ' secret ', 'Adam_1']]);
    assert.deepEqual(patchCalls, [{ username: 'Adam_1' }]);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.uid, 'new-user');
    assert.equal(upserts[0]?.data.aiEnabled, true);
    assert.equal(upserts[0]?.data.socialEnabled, false);
    assert.equal(upserts[0]?.data.username, 'Adam_1');
    assert.equal(upserts[0]?.data.usernameLower, 'adam_1');
    assert.deepEqual(upserts[0]?.options, { syncState: 'synced', serverVersion: 'server-v2' });
    assert.deepEqual(versionBumps, ['bump']);
  });
});
