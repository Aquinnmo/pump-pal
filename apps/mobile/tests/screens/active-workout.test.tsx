import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makePerformedExercise, makeWorkout } from '@/tests/factories';
import { endSession, getSession, updateSession } from '@/lib/active-workout-session';
import type { Workout } from '@/types/workout';

const uid = 'user-1';
const user = { uid };
let routeParams: { id?: string; suggestion?: string } = {};
let plannedRecord: { id: string; data: Workout } | null = null;
let createCalls: { uid: string; workout: Omit<Workout, 'id' | 'userId'> }[] = [];
let updateCalls: { uid: string; id: string; workout: Workout }[] = [];
let createBehavior: () => Promise<string> = async () => 'created-workout';
let updateBehavior: () => Promise<void> = async () => undefined;
let ongoingInjuries: { id: string; status: string }[] = [];
let throwOnInjuryRead = false;
const alerts: string[] = [];
const routerReplacements: string[] = [];
const hapticCalls: unknown[] = [];
let remoteFinishListener: ((action: { action: string; workoutId: string }) => void) | null = null;
const router = {
  replace: (path: string) => routerReplacements.push(path),
  push: (_path: string) => {},
  back: () => {},
};

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Icons are a native rendering package; keep the real screen layout and
// interactions while using an inert glyph at this platform boundary.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'active-workout-icon-test-double',
  setup(build: Build) {
    build.module('@expo/vector-icons', () => ({
      exports: {
        Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
        MaterialIcons: () => null,
        default: () => null,
      },
      loader: 'object',
    }));
    build.module('expo-router', () => ({
      exports: { router, useLocalSearchParams: () => routeParams },
      loader: 'object',
    }));
    build.module('react-native-safe-area-context', () => ({
      exports: { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
      loader: 'object',
    }));
    build.module('react-native-gesture-handler', () => ({
      exports: {
        Gesture: { Pan: () => {
          const pan = { onUpdate: () => pan, onEnd: () => pan };
          return pan;
        } },
        GestureDetector: ({ children }: { children?: unknown }) => children ?? null,
        GestureHandlerRootView: ({ children }: { children?: unknown }) => children ?? null,
      },
      loader: 'object',
    }));
    build.module('react-native-reanimated', () => ({
      exports: {
        default: {
          View: ({ children }: { children?: unknown }) => children ?? null,
        },
        FadeIn: { duration: (duration: number) => ({ duration }) },
        FadeOut: { duration: (duration: number) => ({ duration }) },
        interpolate: () => 1,
        runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
        useAnimatedStyle: (factory: () => unknown) => factory(),
        useSharedValue: (value: unknown) => ({ value }),
        withSequence: (...animations: unknown[]) => animations.at(-1),
        withSpring: (value: unknown) => value,
        withTiming: (value: unknown) => value,
      },
      loader: 'object',
    }));
    build.module('expo-haptics', () => ({
      exports: {
        ImpactFeedbackStyle: { Light: 'light' },
        NotificationFeedbackType: { Success: 'success' },
        impactAsync: (style: unknown) => {
          hapticCalls.push(['impact', style]);
          return Promise.resolve();
        },
        notificationAsync: (type: unknown) => {
          hapticCalls.push(['notification', type]);
          return Promise.resolve();
        },
      },
      loader: 'object',
    }));
  },
});

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({
    user,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async () => {},
    signUp: async () => {},
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => {},
  }),
}));
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getById: async () => plannedRecord,
    getHistory: async () => [],
    create: async (createdUid: string, workout: Omit<Workout, 'id' | 'userId'>) => {
      createCalls.push({ uid: createdUid, workout });
      return createBehavior();
    },
    update: async (updatedUid: string, id: string, workout: Workout) => {
      updateCalls.push({ uid: updatedUid, id, workout });
      return updateBehavior();
    },
    softDelete: async () => {},
  },
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: { get: async () => null },
}));
mock.module(new URL('../../src/data/web-direct-firestore.ts', import.meta.url).pathname, () => ({
  invalidateWebReads: () => {},
  listWebEntities: async (_uid: string, kind: string) => {
    if (kind !== 'injury') return [];
    if (throwOnInjuryRead) throw new Error('injury read failed');
    return ongoingInjuries;
  },
  listWebInjuryRecords: async () => [],
  readWebProfile: async () => undefined,
  readWebPushup: async () => ({ version: null, data: {} }),
  getWebCatalog: async () => ({ exercises: [] }),
  webFirestore: () => ({}),
}));

// These are read-only screen contexts. The repositories above remain the only
// persistence seams under test; the UI and draft editing engine are real.
mock.module('@/hooks/use-exercise-catalog', () => ({
  useExerciseCatalog: () => ({ options: [], byId: new Map(), loading: false, error: null }),
}));
mock.module('@/lib/use-ai-quota', () => ({ useAIQuota: () => ({ usesLeft: null }) }));
mock.module('@/lib/use-ai-enabled', () => ({ useAIEnabled: () => false }));
mock.module('@/lib/use-ai-connectivity', () => ({ useAIGenerationAvailable: () => true }));
mock.module('@/config/firebase', () => ({ auth: { currentUser: user } }));
mock.module('@/lib/wear-sync', () => ({
  pushWearState: () => {},
  subscribeWearActions: (listener: (action: { action: string; workoutId: string }) => void) => {
    remoteFinishListener = listener;
    return () => {
      remoteFinishListener = null;
    };
  },
}));
mock.module('@/lib/live-update-notification-actions', () => ({
  subscribeLiveUpdateNotificationActions: () => () => {},
}));
mock.module(new URL('../../src/ui/workout/finish-workout-celebration.tsx', import.meta.url).pathname, () => ({
  FinishWorkoutCelebration: () => (
    <div data-testid="finish-workout-celebration">Workout complete</div>
  ),
}));

const { default: ActiveWorkoutScreen } = await import('../../app/active-workout');

function record(data: Workout): { id: string; data: Workout } {
  return { id: data.id, data };
}

function finishButton(): HTMLElement {
  return screen.getByText('Finish', { exact: true });
}

function focusPlan(id = 'focus-plan'): { id: string; data: Workout } {
  return record(makeWorkout({
    id,
    name: 'Focus Day',
    status: 'planned',
    queueOrder: 0,
    performedExercises: [makePerformedExercise({
      sets: [{ setNumber: 1, reps: 8, weight: 20, completed: true }],
    })],
  }));
}

async function renderScreen(params: { id?: string; suggestion?: string } = {}) {
  routeParams = params;
  render(<ActiveWorkoutScreen />);
  await waitFor(() => assert.ok(screen.getByText('Finish', { exact: true })));
}

beforeEach(() => {
  routeParams = {};
  plannedRecord = null;
  createCalls = [];
  updateCalls = [];
  createBehavior = async () => 'created-workout';
  updateBehavior = async () => undefined;
  ongoingInjuries = [];
  throwOnInjuryRead = false;
  alerts.length = 0;
  routerReplacements.length = 0;
  hapticCalls.length = 0;
  remoteFinishListener = null;
  window.alert = (message: string) => alerts.push(message);
  endSession();
});

afterEach(() => {
  cleanup();
  endSession();
});

describe('ActiveWorkoutScreen finish boundary', () => {
  it('does not persist until Finish, then creates an empty workout for blank rows', async () => {
    await renderScreen({ suggestion: 'Push Day' });

    assert.equal(createCalls.length, 0);
    assert.equal(updateCalls.length, 0);

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(createCalls.length, 1));
    assert.equal(updateCalls.length, 0);
    assert.equal(createCalls[0]!.uid, uid);
    assert.deepEqual(createCalls[0]!.workout.performedExercises, []);
    assert.equal(createCalls[0]!.workout.name, 'Push Day');
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
    await waitFor(() => assert.equal(routerReplacements.length, 1), { timeout: 2_000 });
  });

  it('shows confirmation before finishing with incomplete sets', async () => {
    plannedRecord = record(makeWorkout({
      id: 'incomplete-plan',
      name: 'Incomplete Day',
      status: 'planned',
      queueOrder: 0,
      performedExercises: [makePerformedExercise({
        sets: [{ setNumber: 1, reps: 8, weight: 20, completed: false }],
      })],
    }));
    await renderScreen({ id: 'incomplete-plan' });

    fireEvent.click(finishButton());
    await waitFor(() => assert.ok(screen.getByText('Finish Anyway', { exact: true })));
    assert.equal(createCalls.length, 0);
    assert.equal(routerReplacements.length, 0);

    fireEvent.click(screen.getByText('Cancel', { exact: true }));
    await waitFor(() => assert.equal(screen.queryByText('Finish Anyway', { exact: true }), null));
    assert.equal(createCalls.length, 0);
    assert.ok(getSession());
  });

  it('filters incomplete and blank rows, omits completed, and renumbers planned updates', async () => {
    const data = makeWorkout({
      id: 'plan-1',
      name: 'Push Day',
      status: 'planned',
      queueOrder: 0,
      performedExercises: [
        makePerformedExercise({
          order: 0,
          exerciseId: 'bench-press',
          exerciseNameSnapshot: 'Bench Press',
          sets: [
            { setNumber: 1, reps: 8, weight: 40, completed: true },
            { setNumber: 2, reps: 6, weight: 40, completed: false },
          ],
        }),
        makePerformedExercise({
          order: 1,
          exerciseId: 'blank',
          exerciseNameSnapshot: '',
          sets: [{ setNumber: 1, reps: 10, weight: 20, completed: true }],
        }),
        makePerformedExercise({
          order: 2,
          exerciseId: 'squat',
          exerciseNameSnapshot: 'Squat',
          sets: [{ setNumber: 1, reps: 5, weight: 80, completed: true }],
        }),
      ],
    });
    plannedRecord = record(data);

    await renderScreen({ id: 'plan-1' });
    assert.equal(createCalls.length, 0);
    assert.equal(updateCalls.length, 0);

    fireEvent.click(finishButton());
    await waitFor(() => assert.ok(screen.getByText('Finish Anyway')));
    fireEvent.click(screen.getByText('Finish Anyway', { exact: true }));
    await waitFor(() => assert.equal(updateCalls.length, 1));

    assert.equal(createCalls.length, 0);
    const saved = updateCalls[0]!.workout;
    assert.equal(updateCalls[0]!.uid, uid);
    assert.equal(updateCalls[0]!.id, 'plan-1');
    assert.deepEqual(
      saved.performedExercises.map(({ exerciseNameSnapshot, order, sets }) => ({
        exerciseNameSnapshot,
        order,
        sets,
      })),
      [
        { exerciseNameSnapshot: 'Bench Press', order: 0, sets: [{ setNumber: 1, reps: 8, weight: 40, bodyweight: false }] },
        { exerciseNameSnapshot: 'Squat', order: 1, sets: [{ setNumber: 1, reps: 5, weight: 80, bodyweight: false }] },
      ],
    );
    assert.equal(saved.performedExercises.some((exercise) => exercise.exerciseNameSnapshot === ''), false);
    assert.equal(saved.performedExercises.some((exercise) => exercise.sets.some((set) => 'completed' in set)), false);
    assert.equal(saved.status, 'completed');
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
  });

  it('guards a terminal double Finish while the repository write is pending', async () => {
    const data = makeWorkout({ id: 'plan-1', status: 'planned', queueOrder: 0 });
    plannedRecord = record(data);
    let resolveUpdate!: () => void;
    updateBehavior = () => new Promise<void>((resolve) => { resolveUpdate = resolve; });

    await renderScreen({ id: 'plan-1' });
    const finish = finishButton();
    fireEvent.click(finish);
    fireEvent.click(finish);
    await waitFor(() => assert.equal(updateCalls.length, 1));
    assert.equal(updateCalls.length, 1);

    resolveUpdate();
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
    await waitFor(() => assert.equal(routerReplacements.length, 1), { timeout: 2_000 });
  });

  it('resets the terminal guard after a failed Finish so retry can write', async () => {
    await renderScreen({ suggestion: 'Retry Day' });
    let attempt = 0;
    createBehavior = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('temporary failure');
      return 'created-after-retry';
    };

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(createCalls.length, 1));
    await waitFor(() => assert.equal(alerts.length, 1));

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(createCalls.length, 2));
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
  });

  it('stamps ongoing injury ids onto a completed workout', async () => {
    ongoingInjuries = [{ id: 'injury-shoulder', status: 'ongoing' }];
    await renderScreen({ suggestion: 'Injured Day' });

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(createCalls.length, 1));
    assert.deepEqual(createCalls[0]!.workout.injuries, ['injury-shoulder']);
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
  });

  // BUG: The web implementation does not preserve the documented fail-closed
  // [] fallback when the ongoing-injury repository read throws; finishing aborts.
  it('keeps the current session when the ongoing-injury read throws', async () => {
    throwOnInjuryRead = true;
    await renderScreen({ suggestion: 'Injury Read Failure' });

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(alerts.length, 1));
    assert.equal(createCalls.length, 0);
    assert.equal(routerReplacements.length, 0);
    assert.equal(alerts[0], 'Error\n\nCould not finish workout. injury read failed');
    assert.equal(getSession()?.name, 'Injury Read Failure');
  });

  it('alerts on persistence failure without navigating or ending the session', async () => {
    createBehavior = async () => { throw new Error('write failed'); };
    await renderScreen({ suggestion: 'Write Failure' });

    fireEvent.click(finishButton());
    await waitFor(() => assert.equal(alerts.length, 1));
    assert.equal(createCalls.length, 1);
    assert.equal(routerReplacements.length, 0);
    assert.equal(screen.queryByTestId('finish-workout-celebration'), null);
    assert.equal(alerts[0], 'Error\n\nCould not finish workout. write failed');
    assert.equal(getSession()?.name, 'Write Failure');
  });

  it('keeps Focus View pending until persistence succeeds, then confirms before navigating', async () => {
    plannedRecord = focusPlan();
    let resolveUpdate!: () => void;
    updateBehavior = () => new Promise<void>((resolve) => { resolveUpdate = resolve; });

    await renderScreen({ id: 'focus-plan' });
    fireEvent.click(screen.getByText('Finish Workout', { exact: true }));
    await waitFor(() => assert.equal(updateCalls.length, 1));

    assert.ok(screen.getAllByRole('progressbar').length >= 2);
    assert.equal(screen.queryByText('Workout complete', { exact: true }), null);
    assert.equal(screen.queryByTestId('finish-workout-celebration'), null);
    assert.equal(routerReplacements.length, 0);
    assert.equal(hapticCalls.length, 0);

    await act(async () => resolveUpdate());
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(getSession(), null);
    assert.equal(screen.queryByText('Finish Workout', { exact: true }), null);
    assert.equal(routerReplacements.length, 0);
    assert.deepEqual(hapticCalls, [['notification', 'success']]);

    await waitFor(() => assert.equal(routerReplacements.length, 1), { timeout: 2_000 });
  });

  it('routes a mounted remote finish through the same persisted celebration hold', async () => {
    await renderScreen({ suggestion: 'Remote Day' });
    const session = getSession();
    assert.ok(session);
    assert.ok(remoteFinishListener);

    await act(async () => {
      remoteFinishListener!({ action: 'finishWorkout', workoutId: session!.id });
    });
    await waitFor(() => assert.equal(createCalls.length, 1));
    await waitFor(() => assert.ok(screen.getByTestId('finish-workout-celebration')));
    assert.equal(routerReplacements.length, 0);
    await waitFor(() => assert.equal(routerReplacements.length, 1), { timeout: 2_000 });
  });

  it('does not show Focus View success or navigate after a failed persistence write', async () => {
    plannedRecord = focusPlan('failed-focus-plan');
    updateBehavior = async () => { throw new Error('write failed'); };

    await renderScreen({ id: 'failed-focus-plan' });
    fireEvent.click(screen.getByText('Finish Workout', { exact: true }));
    await waitFor(() => assert.equal(alerts.length, 1));

    assert.equal(screen.queryByText('Workout complete', { exact: true }), null);
    assert.equal(screen.queryByTestId('finish-workout-celebration'), null);
    assert.equal(routerReplacements.length, 0);
    assert.equal(hapticCalls.length, 0);
  });

  it('falls back from focus to the editor when all rows become empty', async () => {
    plannedRecord = record(makeWorkout({
      id: 'focus-plan',
      name: 'Focus Day',
      status: 'planned',
      queueOrder: 0,
      performedExercises: [makePerformedExercise()],
    }));

    await renderScreen({ id: 'focus-plan' });
    assert.ok(screen.getByText('Edit workout', { exact: true }));

    await act(async () => {
      updateSession([], 'Focus Day');
    });
    await waitFor(() => assert.equal(screen.queryByText('Edit workout', { exact: true }), null));
    assert.equal(screen.queryByText('Edit workout', { exact: true }), null);
  });
});
