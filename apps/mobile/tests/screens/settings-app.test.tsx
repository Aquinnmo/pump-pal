import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';
import type { UserDoc } from '../../src/types/user';
import type { Workout } from '../../src/types/workout';

const user = { uid: 'settings-app-test-user' };
let profileData: UserDoc = { aiEnabled: false, socialEnabled: true, username: 'Test User' };
let workouts: Workout[] = [];
let workoutError: Error | null = null;
let holdUpsert = false;
let releaseUpsert: (() => void) | null = null;
const upserts: Array<{ uid: string; data: UserDoc }> = [];
const writes: string[] = [];
const shares: Array<{ uri: string; options: Record<string, unknown> }> = [];

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
    get: async () => ({
      id: 'profile',
      data: profileData,
      syncState: 'synced',
      serverVersion: null,
      updatedAt: '2026-08-27T00:00:00.000Z',
      deleted: false,
    }),
    upsert: async (uid: string, data: UserDoc) => {
      if (holdUpsert) await new Promise<void>((resolve) => { releaseUpsert = resolve; });
      upserts.push({ uid, data });
      profileData = data;
    },
  },
}));

mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async () => {
      if (workoutError) throw workoutError;
      return workouts.map((data) => ({
        id: data.id,
        data,
        syncState: 'synced' as const,
        serverVersion: null,
        updatedAt: '2026-08-27T00:00:00.000Z',
        deleted: false,
      }));
    },
  },
}));

mock.module('expo-file-system', () => ({
  cacheDirectory: '/cache/',
  writeAsStringAsync: async (_uri: string, contents: string) => {
    writes.push(contents);
  },
  EncodingType: { UTF8: 'utf8' },
}));

mock.module('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string, options: Record<string, unknown>) => {
    shares.push({ uri, options });
  },
}));

mock.module('expo-updates', () => ({
  checkForUpdateAsync: async () => ({ isAvailable: false }),
  fetchUpdateAsync: async () => undefined,
  reloadAsync: async () => undefined,
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('expo-router', () => ({
  router: { back: () => undefined },
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
    View: ({
      accessibilityLabel,
      accessibilityRole,
      children,
    }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children?: ReactNode;
    }) => (
      <div role={accessibilityRole} aria-label={accessibilityLabel}>
        {children}
      </div>
    ),
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

const { default: SettingsAppScreen } = await import('../../app/settings-app');

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    userId: user.uid,
    name: 'Push, "A"',
    notes: 'note "quoted", here',
    date: '2026-08-27T12:00:00.000Z',
    performedExercises: [{
      order: 0,
      exerciseId: 'bench-press',
      exerciseRefPath: 'exercises/bench-press',
      exerciseNameSnapshot: 'Bench, "Flat"',
      variationId: 'wide-grip',
      variationNameSnapshot: 'Wide "grip"',
      sets: [{ setNumber: 1, reps: 8, weight: 100, bodyweight: false }],
    }],
    schemaVersion: 2,
    status: 'completed',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  profileData = { aiEnabled: false, socialEnabled: true, username: 'Test User' };
  workouts = [];
  workoutError = null;
  holdUpsert = false;
  releaseUpsert = null;
  upserts.length = 0;
  writes.length = 0;
  shares.length = 0;
});

afterEach(() => {
  cleanup();
  releaseUpsert?.();
  releaseUpsert = null;
  holdUpsert = false;
});

describe('SettingsAppScreen', () => {
  it('renders the app settings controls and default preference values', async () => {
    render(<SettingsAppScreen />);
    await settle();

    assert.ok(screen.getByText('App'));
    assert.ok(screen.getByText('AI Features'));
    assert.ok(screen.getByText('Social Features'));
    assert.ok(screen.getByText('SEND FEEDBACK'));
    assert.ok(screen.getByText('Update App'));
    assert.ok(screen.getByText('Export Training Data'));
    assert.equal((screen.getByRole('switch', { name: 'AI features' }) as HTMLInputElement).checked, false);
    assert.equal((screen.getByRole('switch', { name: 'Social features' }) as HTMLInputElement).checked, true);
  });

  it('exports an empty history as the CSV header and shares the generated file', async () => {
    render(<SettingsAppScreen />);
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByText('Export Training Data'));
      await Promise.resolve();
    });
    await waitFor(() => assert.equal(writes.length, 1));

    assert.equal(
      writes[0],
      'Date,Workout,Notes,Exercise,Variation,Set,Reps,Weight (lbs),Duration (sec),Hold (sec),Bodyweight',
    );
    assert.equal(shares.length, 1);
    assert.equal(shares[0]?.options.mimeType, 'text/csv');
  });

  it('quotes only the documented text CSV fields and preserves numeric fields unquoted', async () => {
    workouts = [workout()];
    render(<SettingsAppScreen />);
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByText('Export Training Data'));
      await Promise.resolve();
    });
    await waitFor(() => assert.equal(writes.length, 1));

    assert.equal(
      writes[0],
      [
        'Date,Workout,Notes,Exercise,Variation,Set,Reps,Weight (lbs),Duration (sec),Hold (sec),Bodyweight',
        'Aug 27, 2026,"Push, ""A""","note ""quoted"", here","Bench, ""Flat""","Wide ""grip""",1,8,100,,,No',
      ].join('\n'),
    );
  });

  it('shows an export error when workout history cannot be read', async () => {
    workoutError = new Error('offline');
    render(<SettingsAppScreen />);
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByText('Export Training Data'));
      await Promise.resolve();
    });
    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.ok(screen.getByText('Could not export data'));
    assert.equal(writes.length, 0);
    assert.equal(shares.length, 0);
  });

  it('blocks a second preference toggle while the first profile save is pending', async () => {
    holdUpsert = true;
    render(<SettingsAppScreen />);
    await settle();

    const aiSwitch = screen.getByRole('switch', { name: 'AI features' });
    const socialSwitch = screen.getByRole('switch', { name: 'Social features' });
    fireEvent.click(aiSwitch);
    await waitFor(() => assert.ok(screen.getByRole('progressbar', { name: 'Saving' })));
    assert.equal(socialSwitch.hasAttribute('disabled'), true);

    fireEvent.click(socialSwitch);
    assert.equal(upserts.length, 0);

    await act(async () => {
      releaseUpsert?.();
      releaseUpsert = null;
      holdUpsert = false;
    });
    await waitFor(() => assert.equal(upserts.length, 1));
    assert.equal(upserts[0]?.uid, user.uid);
    assert.equal(upserts[0]?.data.aiEnabled, true);
    assert.equal(upserts[0]?.data.socialEnabled, true);
  });
});
