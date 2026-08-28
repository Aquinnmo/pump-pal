import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makeCatalogExercise, makeWorkout } from '../factories';
import { clearAIQuotaCache } from '../../src/lib/ai-quota-cache';

let currentUid = 'muscle-insight-test-0';
let uidSequence = 0;
let aiEnabled = false;
let refreshCatalog: () => Promise<unknown> = async () => ({ exercises: [], version: 1 });
let readCatalog: () => Promise<unknown[]> = async () => [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({
    user: { uid: currentUid },
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => {},
    signUp: async () => {},
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => {},
  }),
}));
mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  auth: {
    get currentUser() {
      return { uid: currentUid, getIdToken: async () => 'test-token' };
    },
  },
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => ({ data: { aiEnabled } }),
  },
}));
mock.module(new URL('../../src/data/catalog-repository.web.ts', import.meta.url).pathname, () => ({
  catalogRepository: {
    refresh: () => refreshCatalog(),
    getAll: async () => readCatalog(),
  },
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const storage = await import('@react-native-async-storage/async-storage');
const { MuscleInsightCards } = await import('../../src/ui/muscle-insight-cards');

function recentWorkout() {
  return makeWorkout({ date: new Date(), name: 'Recent workout' });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  currentUid = `muscle-insight-test-${++uidSequence}`;
  aiEnabled = false;
  refreshCatalog = async () => ({ exercises: [], version: 1 });
  readCatalog = async () => [];
  clearAIQuotaCache();
  await storage.default.clear();
});

afterEach(() => {
  cleanup();
});

describe('MuscleInsightCards', () => {
  it('renders nothing when there are no workouts', async () => {
    render(<MuscleInsightCards workouts={[]} />);
    await settle();

    assert.equal(screen.queryByText('AI INSIGHTS'), null);
    assert.equal(screen.queryByText('Muscle Fatigue'), null);
  });

  it('shows the loading presentation while analysis is in flight', async () => {
    let resolveCatalog!: (value: unknown) => void;
    refreshCatalog = () => new Promise((resolve) => { resolveCatalog = resolve; });
    const workout = recentWorkout();

    render(<MuscleInsightCards workouts={[workout]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze muscle fatigue.' }));

    assert.ok(screen.getByRole('progressbar', { name: 'Analyzing your workouts' }));
    assert.equal(screen.queryByText('Training looks balanced'), null);

    resolveCatalog({ exercises: [], version: 1 });
    await settle();
  });

  it('shows a user-legible error when analysis cannot run', async () => {
    refreshCatalog = async () => ({ exercises: [makeCatalogExercise()], version: 1 });

    render(<MuscleInsightCards workouts={[recentWorkout()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze muscle fatigue.' }));

    await waitFor(() => assert.ok(screen.getByText(/AI error: AI features are off/)));
    assert.ok(screen.getByText('Insights aren’t available'));
    assert.ok(screen.getByText('Tap to try again'));
  });

  it('renders cached populated insight content and its refresh action', async () => {
    await storage.default.setItem(
      `muscle_insights_${currentUid}`,
      JSON.stringify({ insights: { overTrained: ['Chest'], underTrained: ['Back'] } }),
    );

    render(<MuscleInsightCards workouts={[recentWorkout()]} />);
    await waitFor(() => assert.ok(screen.getByText('Over Trained')));

    assert.ok(screen.getByText('Chest'));
    assert.ok(screen.getByText('Under Trained'));
    assert.ok(screen.getByText('Back'));
    assert.ok(screen.getByRole('button', { name: 'Refresh AI muscle insights.' }));
  });
});
