import assert from 'node:assert/strict';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';

const user = { uid: 'up-next-screen-test-user' };
let currentUser: typeof user | null = user;
let authLoading = false;
let target: { id?: string; suggestion?: string } = {};
let targetError: Error | null = null;
let holdTarget = false;
let releaseTarget: (() => void) | null = null;
const resolveCalls: string[] = [];
const replacements: unknown[] = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user: currentUser, loading: authLoading }),
}));

mock.module('@/lib/up-next-target', () => ({
  resolveUpNextTarget: async (uid: string) => {
    resolveCalls.push(uid);
    if (holdTarget) {
      await new Promise<void>((resolve) => { releaseTarget = resolve; });
    }
    if (targetError) throw targetError;
    return target;
  },
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Keep the landing route real while making its automatic destination observable
// without mounting an Expo Router navigator.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'up-next-screen-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { replace: (destination: unknown) => replacements.push(destination) },
      },
      loader: 'object',
    }));
  },
});

const { default: UpNextScreen } = await import('../../app/up-next');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  currentUser = user;
  authLoading = false;
  target = {};
  targetError = null;
  holdTarget = false;
  releaseTarget = null;
  resolveCalls.length = 0;
  replacements.length = 0;
});

afterEach(() => {
  cleanup();
  releaseTarget?.();
  releaseTarget = null;
  holdTarget = false;
});

describe('UpNextScreen', () => {
  it('keeps the loading presentation and waits for auth before resolving', async () => {
    authLoading = true;
    const view = render(<UpNextScreen />);
    assert.ok(screen.getByRole('progressbar'));
    await settle();
    assert.deepEqual(resolveCalls, []);
    assert.deepEqual(replacements, []);

    authLoading = false;
    view.rerender(<UpNextScreen />);
    await waitFor(() => assert.deepEqual(replacements, [{ pathname: '/active-workout', params: {} }]));
    assert.deepEqual(resolveCalls, [user.uid]);
  });

  it('resolves a planned workout id and navigates with the route param', async () => {
    target = { id: 'planned-workout-1' };
    render(<UpNextScreen />);

    await waitFor(() => assert.deepEqual(replacements, [
      { pathname: '/active-workout', params: { id: 'planned-workout-1' } },
    ]));
    assert.deepEqual(resolveCalls, [user.uid]);
  });

  it('resolves a predicted suggestion and navigates with the suggestion param', async () => {
    target = { suggestion: 'Pull' };
    render(<UpNextScreen />);

    await waitFor(() => assert.deepEqual(replacements, [
      { pathname: '/active-workout', params: { suggestion: 'Pull' } },
    ]));
  });

  it('navigates an empty target to a new active workout with no params', async () => {
    target = {};
    render(<UpNextScreen />);

    await waitFor(() => assert.deepEqual(replacements, [{ pathname: '/active-workout', params: {} }]));
  });

  it('falls back to the active workout with empty params when target resolution fails', async () => {
    targetError = new Error('offline');
    const originalError = console.error;
    console.error = () => undefined;
    try {
      render(<UpNextScreen />);
      await waitFor(() => assert.deepEqual(replacements, [{ pathname: '/active-workout', params: {} }]));
    } finally {
      console.error = originalError;
    }
  });

  it('keeps the spinner until a held target resolution settles', async () => {
    holdTarget = true;
    render(<UpNextScreen />);
    assert.ok(screen.getByRole('progressbar'));
    await settle();
    assert.deepEqual(replacements, []);

    await act(async () => {
      releaseTarget?.();
      releaseTarget = null;
      holdTarget = false;
    });
    await waitFor(() => assert.deepEqual(replacements, [{ pathname: '/active-workout', params: {} }]));
  });

  it('does not resolve or navigate while logged out', async () => {
    currentUser = null;
    render(<UpNextScreen />);
    await settle();

    assert.ok(screen.getByRole('progressbar'));
    assert.deepEqual(resolveCalls, []);
    assert.deepEqual(replacements, []);
  });
});
