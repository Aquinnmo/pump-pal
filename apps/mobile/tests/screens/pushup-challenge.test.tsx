import assert from 'node:assert/strict';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { ChallengeData } from '../../src/types/pushup-challenge';

const user = { uid: 'pushup-challenge-test-user' };
let storedData: ChallengeData | null = null;
let loadError: Error | null = null;
const upserts: ChallengeData[] = [];
const RealDate = Date;

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

mock.module(new URL('../../src/data/pushup-repository.web.ts', import.meta.url).pathname, () => ({
  pushupRepository: {
    get: async () => {
      if (loadError) throw loadError;
      return storedData ? { id: 'pushup_challenge', data: storedData } : null;
    },
    upsert: async (_uid: string, data: ChallengeData) => {
      upserts.push(data);
      storedData = data;
    },
  },
}));

mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  auth: { currentUser: null },
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// Keep the swipe track positive-width in the DOM harness; production reads the
// device window dimensions from React Native.
Object.defineProperty(document.documentElement, 'clientWidth', {
  configurable: true,
  value: 390,
});
Object.defineProperty(document.documentElement, 'clientHeight', {
  configurable: true,
  value: 844,
});
const { Dimensions } = await import('react-native');
Dimensions.get('window');

const { default: PushupChallengeScreen } = await import('../../app/(tabs)/pushup-challenge');

function challenge(overrides: Partial<ChallengeData> = {}): ChallengeData {
  return {
    startDate: '2026-08-10',
    days: [],
    longestStreak: 0,
    ...overrides,
  };
}

function freezeNow(iso: string): void {
  const milliseconds = RealDate.parse(iso);
  class FrozenDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) super(milliseconds);
      else if (value instanceof RealDate) super(value.getTime());
      else super(value);
    }

    static now(): number {
      return milliseconds;
    }
  }

  globalThis.Date = FrozenDate as unknown as DateConstructor;
}

function restoreDate(): void {
  globalThis.Date = RealDate;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  storedData = null;
  loadError = null;
  upserts.length = 0;
  restoreDate();
});

afterEach(() => {
  cleanup();
  restoreDate();
});

describe('PushupChallengeScreen', () => {
  it('renders the loading baseline until the repository read resolves', async () => {
    let resolveLoad!: (value: null) => void;
    const pending = new Promise<null>((resolve) => {
      resolveLoad = resolve;
    });
    mock.module(new URL('../../src/data/pushup-repository.web.ts', import.meta.url).pathname, () => ({
      pushupRepository: {
        get: () => pending,
        upsert: async () => undefined,
      },
    }));

    render(<PushupChallengeScreen />);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('The Pushup Challenge'), null);

    resolveLoad(null);
    await settle();
    assert.ok(screen.getByText('The Pushup Challenge'));
  });

  it('renders the empty challenge baseline and starts a challenge on the primary action', async () => {
    freezeNow('2026-08-12T16:00:00.000Z');
    render(<PushupChallengeScreen />);
    await settle();

    assert.ok(screen.getByText(/Day 1 → 1 pushup/));
    const start = screen.getByText('Start Challenge');
    await act(async () => {
      start.click();
    });
    assert.deepEqual(upserts, [
      { startDate: '2026-08-12', days: [], longestStreak: 0 },
    ]);
  });

  it('builds local-day timeline nodes across a local-midnight UTC rollover', async () => {
    freezeNow('2026-08-13T03:30:00.000Z'); // Aug 12, 11:30 PM in America/Toronto.
    storedData = challenge({ startDate: '2026-08-12' });
    render(<PushupChallengeScreen />);
    await settle();

    assert.ok(screen.getByText('Wednesday, Aug 12, 2026'));
    assert.ok(screen.getByText('Day 1'));
    assert.ok(screen.getByText('Incomplete'));
    assert.ok(screen.getByText('I did 1 pushup today'));
    assert.equal(screen.queryByText('Thursday, Aug 13, 2026'), null);
  });

  it('breaks the streak after a missed day and hides the completion slider', async () => {
    freezeNow('2026-08-13T16:00:00.000Z');
    storedData = challenge({
      startDate: '2026-08-10',
      days: [
        { date: '2026-08-10', dayNumber: 1, completedAt: '2026-08-10T16:00:00.000Z' },
        { date: '2026-08-12', dayNumber: 3, completedAt: '2026-08-12T16:00:00.000Z' },
      ],
      longestStreak: 2,
    });
    render(<PushupChallengeScreen />);
    await settle();

    assert.ok(screen.getByText('Streak broken — you missed a day. Restart to try again.'));
    assert.ok(screen.getByText('Restart'));
    assert.equal(screen.queryByText(/I did .* pushups? today/), null);
    assert.ok(screen.getByText('2'));
  });

  it('renders no timeline nodes or slider for a future start date', async () => {
    freezeNow('2026-08-12T16:00:00.000Z');
    storedData = challenge({ startDate: '2026-08-13', longestStreak: 4 });
    render(<PushupChallengeScreen />);
    await settle();

    assert.ok(screen.getByText('The Pushup Challenge'));
    assert.equal(screen.queryByText(/^Day \d+$/), null);
    assert.equal(screen.queryByText(/I did .* pushups? today/), null);
    assert.equal(screen.queryByText('Streak broken — you missed a day. Restart to try again.'), null);
    assert.ok(screen.getByText('4'));
  });

  it('keeps the timeline day number aligned across a DST transition', async () => {
    freezeNow('2026-03-09T16:00:00.000Z');
    storedData = challenge({
      startDate: '2026-03-07',
      days: [
        { date: '2026-03-07', dayNumber: 1, completedAt: '2026-03-07T16:00:00.000Z' },
        { date: '2026-03-08', dayNumber: 2, completedAt: '2026-03-08T16:00:00.000Z' },
      ],
    });
    render(<PushupChallengeScreen />);
    await settle();

    assert.ok(screen.getByText('Day 3'));
    assert.ok(screen.getByText('I did 3 pushups today'));
  });

  it('falls back to the intro after a repository error', async () => {
    loadError = new Error('offline');
    render(<PushupChallengeScreen />);
    await settle();

    // BUG: a failed challenge read is indistinguishable from a new account and
    // offers Start Challenge instead of a retryable error state.
    assert.ok(screen.getByText('The Pushup Challenge'));
    assert.ok(screen.getByText('Start Challenge'));
  });
});
