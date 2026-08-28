import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { useEffect, type ReactNode } from 'react';
import type { BuddyDTO, BuddyRequestDTO, BuddySearchResult } from '@timber/contract/api';
import { toDateKey } from '@/lib/date-key';

const user = { uid: 'social-screen-test-user' };
const router = { push: (path: unknown) => pushed.push(path) };
const pushed: unknown[] = [];

let profileData: { socialEnabled?: boolean } | null = null;
let buddiesResponse: { buddies: BuddyDTO[]; requests: BuddyRequestDTO[] } = {
  buddies: [],
  requests: [],
};
let searchResponse: BuddySearchResult[] = [];
let loadError: Error | null = null;
let holdLoad = false;
let releaseLoad: (() => void) | null = null;
let holdBuddyUp = false;
let releaseBuddyUp: (() => void) | null = null;
const getBuddiesCalls: string[] = [];
const searchCalls: string[] = [];
const buddyUpCalls: string[] = [];
const acceptCalls: string[] = [];
const chopCalls: Array<{ uid: string; today: string }> = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => (profileData ? { data: profileData } : null),
  },
}));
mock.module(new URL('../../src/data/remote/buddies.ts', import.meta.url).pathname, () => ({
  getBuddies: async (today: string) => {
    getBuddiesCalls.push(today);
    if (holdLoad) {
      await new Promise<void>((resolve) => { releaseLoad = resolve; });
    }
    if (loadError) throw loadError;
    return buddiesResponse;
  },
  searchUsers: async (query: string) => {
    searchCalls.push(query);
    return searchResponse;
  },
  sendBuddyRequest: async (uid: string) => {
    if (holdBuddyUp) {
      await new Promise<void>((resolve) => { releaseBuddyUp = resolve; });
    }
    buddyUpCalls.push(uid);
  },
  acceptBuddyRequest: async (uid: string) => { acceptCalls.push(uid); },
  chopBuddy: async (uid: string, today: string) => {
    chopCalls.push({ uid, today });
    return { delivered: true };
  },
}));
mock.module(new URL('../../src/ui/primitives/fading-scroll-view.tsx', import.meta.url).pathname, () => ({
  FadingScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
mock.module(new URL('../../src/ui/primitives/toast.tsx', import.meta.url).pathname, () => ({
  Toast: ({ visible, message }: { visible: boolean; message: string }) =>
    visible ? <div role="alert">{message}</div> : null,
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The shared preload supplies this double, but this local router lets action
// assertions stay scoped to this screen test.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'social-screen-test-doubles',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router,
        useFocusEffect: (effect: () => void | (() => void)) => {
          useEffect(() => effect(), [effect]);
        },
      },
      loader: 'object',
    }));
  },
});

const { default: SocialScreen } = await import('../../app/(tabs)/social');

function buddy(overrides: Partial<BuddyDTO> = {}): BuddyDTO {
  return {
    uid: 'buddy-1',
    username: 'alex',
    currentStreak: 4,
    longestStreak: 9,
    workedOutToday: false,
    lastChoppedAt: null,
    ...overrides,
  };
}

function request(overrides: Partial<BuddyRequestDTO> = {}): BuddyRequestDTO {
  return {
    uid: 'request-1',
    username: 'casey',
    direction: 'incoming',
    ...overrides,
  };
}

beforeEach(() => {
  profileData = null;
  buddiesResponse = { buddies: [], requests: [] };
  searchResponse = [];
  loadError = null;
  holdLoad = false;
  releaseLoad = null;
  holdBuddyUp = false;
  releaseBuddyUp = null;
  getBuddiesCalls.length = 0;
  searchCalls.length = 0;
  buddyUpCalls.length = 0;
  acceptCalls.length = 0;
  chopCalls.length = 0;
  pushed.length = 0;
});

afterEach(() => {
  cleanup();
  releaseLoad?.();
  releaseLoad = null;
  releaseBuddyUp?.();
  releaseBuddyUp = null;
  holdLoad = false;
  holdBuddyUp = false;
});

describe('SocialScreen', () => {
  it('keeps social visible when socialEnabled is absent and renders the empty baseline', async () => {
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('No buddies yet', { exact: true })));

    assert.ok(screen.getByText('Social', { exact: true }));
    assert.ok(screen.getByRole('textbox', { name: 'Search for people by username' }));
    assert.equal(getBuddiesCalls[0], toDateKey(new Date()));
  });

  it('hides social controls when socialEnabled is false and exposes Settings', async () => {
    profileData = { socialEnabled: false };
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('Social features are off', { exact: true })));

    assert.equal(screen.queryByRole('textbox', { name: 'Search for people by username' }), null);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    assert.deepEqual(pushed, ['/settings-app']);
  });

  it('renders loading until the buddies boundary resolves', async () => {
    holdLoad = true;
    render(<SocialScreen />);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('No buddies yet', { exact: true }), null);

    await act(async () => {
      releaseLoad?.();
      releaseLoad = null;
      holdLoad = false;
    });
    await waitFor(() => assert.ok(screen.getByText('No buddies yet', { exact: true })));
  });

  it('renders an error and retries through the same load boundary', async () => {
    loadError = new Error('offline');
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('Could not load your buddies. Tap to retry.', { exact: true })));

    loadError = null;
    fireEvent.click(screen.getByText('Could not load your buddies. Tap to retry.', { exact: true }));
    await waitFor(() => assert.ok(screen.getByText('No buddies yet', { exact: true })));
    assert.equal(getBuddiesCalls.length, 2);
  });

  it('renders incoming requests, populated buddies, trained state, and cooldown state', async () => {
    buddiesResponse = {
      requests: [request()],
      buddies: [
        buddy(),
        buddy({ uid: 'trained-1', username: 'blair', workedOutToday: true }),
        buddy({ uid: 'cooling-1', username: 'drew', lastChoppedAt: new Date(Date.now() - 1000).toISOString() }),
      ],
    };
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('alex', { exact: true })));

    assert.ok(screen.getByText('casey', { exact: true }));
    assert.ok(screen.getByText('Wants to be your buddy.', { exact: true }));
    assert.equal(screen.getAllByText('4 Day Current Streak · Record 9', { exact: true }).length, 3);
    assert.ok(screen.getByText('Trained', { exact: true }));
    assert.equal(screen.getAllByRole('button', { name: 'Chop' }).length, 1);
    assert.match(screen.getByText(/^4:\d\d$/).textContent ?? '', /^4:\d\d$/);
  });

  it('accepts an incoming request and reloads the populated list', async () => {
    buddiesResponse = { requests: [request()], buddies: [] };
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Accept' })));

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => assert.equal(acceptCalls.length, 1));
    assert.deepEqual(acceptCalls, ['request-1']);
    assert.ok(getBuddiesCalls.length >= 2);
  });

  it('debounces search, sends a buddy request, and changes the result to Requested', async () => {
    searchResponse = [{ uid: 'search-1', username: 'sam', state: 'none' }];
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('No buddies yet', { exact: true })));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search for people by username' }), {
      target: { value: 'sam' },
    });
    assert.equal(searchCalls.length, 0);
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Buddy up' })), { timeout: 1000 });
    assert.deepEqual(searchCalls, ['sam']);

    fireEvent.click(screen.getByRole('button', { name: 'Buddy up' }));
    await waitFor(() => assert.ok(screen.getByText('Requested', { exact: true })));
    assert.deepEqual(buddyUpCalls, ['search-1']);
  });

  it('keeps a clicked buddy action busy until its request resolves', async () => {
    searchResponse = [{ uid: 'search-1', username: 'sam', state: 'none' }];
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByText('No buddies yet', { exact: true })));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search for people by username' }), {
      target: { value: 'sam' },
    });
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Buddy up' })), { timeout: 1000 });
    holdBuddyUp = true;
    fireEvent.click(screen.getByRole('button', { name: 'Buddy up' }));
    await waitFor(() => assert.ok(screen.getByRole('progressbar')));
    assert.equal((screen.getByRole('button', { name: 'Buddy up' }) as HTMLButtonElement).disabled, true);

    await act(async () => {
      releaseBuddyUp?.();
      releaseBuddyUp = null;
      holdBuddyUp = false;
    });
    await waitFor(() => assert.equal(buddyUpCalls.length, 1));
    assert.ok(screen.getByText('Requested', { exact: true }));
  });

  it('chops with the current local date, shows the delivered toast, and enters cooldown', async () => {
    buddiesResponse = { requests: [], buddies: [buddy()] };
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Chop' })));

    fireEvent.click(screen.getByRole('button', { name: 'Chop' }));
    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.deepEqual(chopCalls, [{ uid: 'buddy-1', today: toDateKey(new Date()) }]);
    assert.ok(screen.getByText('Chop landed 🪓', { exact: true }));
  });

  it('preserves the malformed cooldown timestamp bypass as a known behavior', async () => {
    buddiesResponse = {
      requests: [],
      buddies: [buddy({ lastChoppedAt: 'not-a-date' })],
    };
    render(<SocialScreen />);
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Chop' })));

    // BUG: Date.parse() returns NaN and cooldownRemaining() lets the Chop
    // action through instead of treating malformed timestamps as cooling down.
    assert.ok(screen.getByRole('button', { name: 'Chop' }));
  });
});
