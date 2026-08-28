import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

type AuthState = { user: { uid: string } | null; loading: boolean };
type StoredProfile = { data: Record<string, unknown> } | null;
type TestGlobal = typeof globalThis & {
  __rootLayoutAuth?: AuthState;
  __rootLayoutProfile?: StoredProfile;
  __rootLayoutProfileError?: Error;
  __rootLayoutProfileGets?: number;
  __rootLayoutSegments?: string[];
  __rootLayoutReplacements?: string[];
};

const testGlobal = globalThis as TestGlobal;
testGlobal.__rootLayoutAuth = { user: null, loading: false };
testGlobal.__rootLayoutProfile = null;
testGlobal.__rootLayoutProfileGets = 0;
testGlobal.__rootLayoutSegments = [];
testGlobal.__rootLayoutReplacements = [];

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => testGlobal.__rootLayoutAuth ?? { user: null, loading: false },
}));

mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => {
      testGlobal.__rootLayoutProfileGets = (testGlobal.__rootLayoutProfileGets ?? 0) + 1;
      if (testGlobal.__rootLayoutProfileError) throw testGlobal.__rootLayoutProfileError;
      return testGlobal.__rootLayoutProfile ?? null;
    },
  },
}));

mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getByStatus: async () => [],
  },
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The preload registers an expo-router double. Register the route state again
// here so redirect assertions can vary segments without importing navigation.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'root-layout-router-test-doubles',
  setup(build: Build) {
    const Stack = Object.assign(
      ({ children }: { children?: ReactNode }) => children ?? null,
      { Screen: ({ children }: { children?: ReactNode }) => children ?? null },
    );
    build.module('expo-router', () => ({
      exports: {
        Stack,
        router: {
          replace: (href: string) => testGlobal.__rootLayoutReplacements?.push(href),
        },
        useSegments: () => testGlobal.__rootLayoutSegments ?? [],
      },
      loader: 'object',
    }));
  },
});

mock.module('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: ReactNode }) => children ?? null,
}));

const animatedView = ({ children }: { children?: ReactNode }) => children ?? null;
mock.module('react-native-reanimated', () => ({
  default: { View: animatedView },
  cancelAnimation: () => undefined,
  Easing: { inOut: (value: unknown) => value, quad: {} },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  interpolate: () => 1,
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  useSharedValue: (value: number) => ({ value }),
  withRepeat: (value: unknown) => value,
  withTiming: (value: number) => value,
}));

mock.module('react-native-get-random-values', () => ({}));

const { default: RootLayout } = await import('../../app/_layout');

afterEach(async () => {
  cleanup();
  testGlobal.__rootLayoutAuth = { user: null, loading: false };
  testGlobal.__rootLayoutProfile = null;
  testGlobal.__rootLayoutProfileError = undefined;
  testGlobal.__rootLayoutProfileGets = 0;
  testGlobal.__rootLayoutSegments = [];
  testGlobal.__rootLayoutReplacements = [];
  const storage = await import('@react-native-async-storage/async-storage');
  await storage.default.clear();
});

function profile(fields: { username?: string; split?: string }): StoredProfile {
  return {
    data: {
      username: fields.username,
      usernameLower: fields.username?.toLowerCase(),
      workoutSplit: fields.split ? { type: fields.split, custom: null } : undefined,
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('root layout account redirect wiring', () => {
  it('redirects a first-time logged-out user to welcome', async () => {
    render(<RootLayout />);
    await settle();

    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/(auth)/welcome']);
  });

  it('redirects a returning logged-out user to sign-in', async () => {
    const storage = await import('@react-native-async-storage/async-storage');
    await storage.default.setItem('pumppal_onboarding_seen', 'true');

    render(<RootLayout />);
    await settle();

    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/(auth)/sign-in']);
  });

  it('redirects onboarding users to the missing username or split step', async () => {
    testGlobal.__rootLayoutAuth = { user: { uid: 'u1' }, loading: false };

    testGlobal.__rootLayoutProfile = profile({ split: 'Push / Pull / Legs' });
    render(<RootLayout />);
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/set-username']);
    cleanup();

    testGlobal.__rootLayoutReplacements = [];
    testGlobal.__rootLayoutProfile = profile({ username: 'adam' });
    render(<RootLayout />);
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/set-split']);
  });

  it('opens ready accounts on tabs and does not redirect from the target route', async () => {
    testGlobal.__rootLayoutAuth = { user: { uid: 'u1' }, loading: false };
    testGlobal.__rootLayoutProfile = profile({ username: 'adam', split: 'Push / Pull / Legs' });

    render(<RootLayout />);
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, []);

    cleanup();
    testGlobal.__rootLayoutSegments = ['(auth)'];
    testGlobal.__rootLayoutReplacements = [];
    render(<RootLayout />);
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/(tabs)']);
  });

  it('keeps the boot overlay while auth, onboarding storage, or account data is pending', async () => {
    testGlobal.__rootLayoutAuth = { user: null, loading: true };
    render(<RootLayout />);

    assert.ok(screen.getByText('Loading your account…'));
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, []);
  });

  it('shows a retryable error overlay when account bootstrap fails', async () => {
    testGlobal.__rootLayoutAuth = { user: { uid: 'u1' }, loading: false };
    testGlobal.__rootLayoutProfileError = new Error('offline');

    render(<RootLayout />);
    await settle();

    assert.ok(screen.getByText('Could not load your account'));
    const retry = screen.getByRole('button', { name: 'Try loading your account again' });
    fireEvent.click(retry);
    await settle();
    assert.equal(testGlobal.__rootLayoutProfileGets, 2);
  });

  it('guards an already active onboarding target against a redirect loop', async () => {
    testGlobal.__rootLayoutAuth = { user: { uid: 'u1' }, loading: false };
    testGlobal.__rootLayoutProfile = profile({ username: 'adam' });
    testGlobal.__rootLayoutSegments = ['set-split'];

    render(<RootLayout />);
    await settle();

    assert.deepEqual(testGlobal.__rootLayoutReplacements, []);
  });

  it('re-evaluates the redirect after account data changes', async () => {
    testGlobal.__rootLayoutAuth = { user: { uid: 'u1' }, loading: false };
    testGlobal.__rootLayoutProfile = profile({ username: 'adam' });
    testGlobal.__rootLayoutSegments = ['set-split'];

    render(<RootLayout />);
    await settle();
    assert.deepEqual(testGlobal.__rootLayoutReplacements, []);

    testGlobal.__rootLayoutProfile = profile({ username: 'adam', split: 'Push / Pull / Legs' });
    const { notifyAccountDataChanged } = await import('../../src/data/initial-sync');
    await act(async () => {
      notifyAccountDataChanged();
    });
    await settle();

    assert.deepEqual(testGlobal.__rootLayoutReplacements, ['/(tabs)']);
  });
});
