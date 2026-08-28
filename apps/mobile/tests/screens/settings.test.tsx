import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const user = { uid: 'settings-test-user', email: 'adam@example.com' };
let profileData: UserDoc | null = { username: 'Adam', aiEnabled: false };
let profileError: Error | null = null;
const pushes: string[] = [];

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

mock.module('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// Render navigation rows as ordinary buttons so the test drives the same
// user-visible press boundary without depending on react-native-web's pointer
// event implementation for TouchableOpacity.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'settings-navigation-test-double',
  setup(build: Build) {
    const reactNativeWeb = require('react-native-web') as Record<string, unknown>;
    build.module('react-native', () => ({
      exports: {
        ...reactNativeWeb,
        TouchableOpacity: ({
          accessibilityLabel,
          children,
          onPress,
        }: {
          accessibilityLabel?: string;
          children?: ReactNode;
          onPress?: () => void;
        }) => (
          <button aria-label={accessibilityLabel} type="button" onClick={() => onPress?.()}>
            {children}
          </button>
        ),
      },
      loader: 'object',
    }));
  },
});

const { router: testRouter } = await import('expo-router') as unknown as {
  router: { push: (href: string) => void };
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  profileData = { username: 'Adam', aiEnabled: false };
  profileError = null;
  pushes.length = 0;
  testRouter.push = (href) => pushes.push(href);
});

afterEach(() => {
  cleanup();
});

describe('SettingsScreen', () => {
  it('renders the account identity, settings sections, guidance, and attribution', async () => {
    const { default: SettingsScreen } = await import('../../app/(tabs)/settings');
    render(<SettingsScreen />);
    await waitFor(() => assert.ok(screen.getByText('Adam', { exact: true })));

    assert.ok(screen.getByText('About', { exact: true }));
    assert.ok(screen.getByText('adam@example.com', { exact: true }));
    assert.ok(screen.getByText('Split', { exact: true }));
    assert.ok(screen.getByText('Injuries', { exact: true }));
    assert.ok(screen.getByText('Account', { exact: true }));
    assert.ok(screen.getByText('App', { exact: true }));
    assert.ok(screen.getByText('This app is currently in development. Features may change and data may be used to improve the app.', { exact: true }));
    assert.ok(screen.getByText('App developed by', { exact: false }));
    assert.ok(screen.getByText('Montgomery Software Foundry Inc.', { exact: true }));
    assert.equal(screen.queryByText('Your workout history may be sent to 3rd parties to power AI features.', { exact: true }), null);
  });

  it('shows the AI disclosure only when the profile feature flag is enabled', async () => {
    const { default: SettingsScreen } = await import('../../app/(tabs)/settings');
    profileData = { username: 'Adam', aiEnabled: true };
    render(<SettingsScreen />);

    await waitFor(() => assert.ok(screen.getByText('Your workout history may be sent to 3rd parties to power AI features.', { exact: true })));

    cleanup();
    profileData = { username: 'Adam' };
    render(<SettingsScreen />);
    await settle();
    assert.equal(screen.queryByText('Your workout history may be sent to 3rd parties to power AI features.', { exact: true }), null);
  });

  it('keeps a usable identity baseline when the profile read fails', async () => {
    const { default: SettingsScreen } = await import('../../app/(tabs)/settings');
    profileError = new Error('offline');
    render(<SettingsScreen />);
    await settle();

    assert.ok(screen.getByText('Athlete', { exact: true }));
    assert.ok(screen.getByText('adam@example.com', { exact: true }));
    assert.equal(screen.queryByText('Your workout history may be sent to 3rd parties to power AI features.', { exact: true }), null);
  });

  it('navigates through each visible settings row exactly once', async () => {
    const { default: SettingsScreen } = await import('../../app/(tabs)/settings');
    render(<SettingsScreen />);
    await settle();

    for (const [label, route] of [
      ['Split', '/settings-split'],
      ['Injuries', '/settings-injuries'],
      ['Account', '/settings-account'],
      ['App', '/settings-app'],
    ] as const) {
      fireEvent.click(screen.getByText(label, { exact: true }));
      assert.equal(pushes.at(-1), route);
    }

    assert.deepEqual(pushes, [
      '/settings-split',
      '/settings-injuries',
      '/settings-account',
      '/settings-app',
    ]);
  });
});
