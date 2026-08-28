import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';
import { ApiValidationError } from '../../src/lib/api-client-core';

const user = { uid: 'settings-username-test-user' };
let profileData: UserDoc = { username: 'Old_Name', aiEnabled: true };
let profileError: Error | null = null;
let upsertError: Error | null = null;
let patchError: Error | null = null;
let patchResult = { username: 'New_Name', version: 'profile-v2' };
let holdProfileGet = false;
let releaseProfileGet: (() => void) | null = null;
let profileGets = 0;
const patchCalls: Array<{ username: string }> = [];
const upserts: Array<{ uid: string; data: UserDoc; options?: Record<string, unknown> }> = [];
const bumps: string[] = [];
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
      profileGets += 1;
      if (holdProfileGet) await new Promise<void>((resolve) => { releaseProfileGet = resolve; });
      if (profileError) throw profileError;
      return {
        id: 'profile',
        data: profileData,
        syncState: 'synced' as const,
        serverVersion: 'profile-v1',
        updatedAt: '2026-08-27T00:00:00.000Z',
        deleted: false,
      };
    },
    upsert: async (uid: string, data: UserDoc, options?: Record<string, unknown>) => {
      if (upsertError) throw upsertError;
      upserts.push({ uid, data, options });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/remote/profile.ts', import.meta.url).pathname, () => ({
  patchProfile: async (input: { username: string }) => {
    patchCalls.push(input);
    if (patchError) throw patchError;
    return patchResult;
  },
}));

mock.module(new URL('../../src/data/data-version.ts', import.meta.url).pathname, () => ({
  bumpDataVersion: () => bumps.push('bump'),
}));

mock.module(new URL('../../src/ui/primitives/toast.tsx', import.meta.url).pathname, () => ({
  Toast: ({ visible, message, type }: { visible: boolean; message: string; type: string }) => {
    if (!visible) return null;
    return <span role="alert" data-toast-type={type}>{message}</span>;
  },
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

mock.module('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
  cancelAnimation: () => undefined,
  Easing: { out: (fn: unknown) => fn, quad: (value: number) => value },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => false,
  useSharedValue: (value: number) => ({ value }),
  withRepeat: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

const { default: SettingsUsernameScreen } = await import('../../app/settings-username');
const { router: testRouter } = await import('expo-router') as unknown as {
  router: { back: () => void };
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderLoaded(): Promise<void> {
  render(<SettingsUsernameScreen />);
  await waitFor(() => assert.equal((screen.getByPlaceholderText('Username') as HTMLInputElement).value, 'Old_Name'));
}

function clickSave(): void {
  fireEvent.click(screen.getByText('Save Username').parentElement!);
}

function changeUsername(value: string): void {
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value } });
}

beforeEach(() => {
  profileData = { username: 'Old_Name', aiEnabled: true };
  profileError = null;
  upsertError = null;
  patchError = null;
  patchResult = { username: 'New_Name', version: 'profile-v2' };
  holdProfileGet = false;
  releaseProfileGet = null;
  profileGets = 0;
  patchCalls.length = 0;
  upserts.length = 0;
  bumps.length = 0;
  backCalls.length = 0;
  testRouter.back = () => backCalls.push('back');
});

afterEach(() => {
  cleanup();
  releaseProfileGet?.();
  releaseProfileGet = null;
  holdProfileGet = false;
});

describe('SettingsUsernameScreen', () => {
  it('renders the loading state and then the populated current username', async () => {
    holdProfileGet = true;
    render(<SettingsUsernameScreen />);

    assert.ok(screen.getByRole('progressbar'));
    assert.equal((screen.getByPlaceholderText('Username') as HTMLInputElement).value, '');
    assert.ok(screen.getByText('Save Username'));

    await act(async () => {
      releaseProfileGet?.();
      releaseProfileGet = null;
      holdProfileGet = false;
    });
    await waitFor(() => assert.equal((screen.getByPlaceholderText('Username') as HTMLInputElement).value, 'Old_Name'));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('keeps the editable blank baseline after a profile load error', async () => {
    profileError = new Error('offline');
    render(<SettingsUsernameScreen />);
    await waitFor(() => assert.equal(screen.queryByRole('progressbar'), null));

    // BUG: a profile read failure is only logged; the screen gives no user-visible
    // error and presents a blank value that looks like a valid editable state.
    assert.equal((screen.getByPlaceholderText('Username') as HTMLInputElement).value, '');
    assert.equal(screen.queryByRole('alert'), null);
    assert.ok(screen.getByText('Save Username'));
  });

  it('leaves the save action inert when the trimmed username is unchanged', async () => {
    await renderLoaded();
    changeUsername('  Old_Name  ');
    clickSave();
    await settle();

    assert.deepEqual(patchCalls, []);
    assert.deepEqual(upserts, []);
  });

  it('shows the format validation error without calling the profile boundaries', async () => {
    await renderLoaded();
    changeUsername('ab');
    clickSave();
    await settle();

    assert.deepEqual(patchCalls, []);
    assert.deepEqual(upserts, []);
    assert.ok(screen.getByRole('alert'));
  });

  it('saves a trimmed valid username, updates the local profile, bumps data, and stays on the screen', async () => {
    await renderLoaded();
    changeUsername('  New_Name  ');
    clickSave();

    await waitFor(() => assert.ok(screen.getByText('Username updated')));
    assert.deepEqual(patchCalls, [{ username: 'New_Name' }]);
    assert.equal(profileGets, 2);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.uid, user.uid);
    assert.deepEqual(upserts[0]?.data, {
      username: 'New_Name',
      usernameLower: 'new_name',
      aiEnabled: true,
    });
    assert.deepEqual(upserts[0]?.options, { syncState: 'synced', serverVersion: 'profile-v2' });
    assert.deepEqual(bumps, ['bump']);
    assert.deepEqual(backCalls, []);
  });

  it('shows the username-taken validation error and leaves the local profile unchanged', async () => {
    patchError = new ApiValidationError('taken', 'username_taken');
    await renderLoaded();
    changeUsername('New_Name');
    clickSave();

    await waitFor(() => assert.ok(screen.getByText('That username is taken. Try another.')));
    assert.deepEqual(patchCalls, [{ username: 'New_Name' }]);
    assert.deepEqual(upserts, []);
    assert.deepEqual(bumps, []);
    assert.deepEqual(backCalls, []);
  });

  it('shows a generic save error and clears saving when the repository update fails', async () => {
    upsertError = new Error('offline');
    await renderLoaded();
    changeUsername('New_Name');
    clickSave();

    await waitFor(() => assert.ok(screen.getByText('Could not save username')));
    assert.deepEqual(patchCalls, [{ username: 'New_Name' }]);
    assert.equal(upserts.length, 0);
    assert.ok(screen.getByText('Save Username'));
  });

  it('navigates back when the header back action is pressed', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByLabelText('arrow-back icon').parentElement!);
    assert.deepEqual(backCalls, ['back']);
  });
});
