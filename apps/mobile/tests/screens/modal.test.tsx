import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import React, { type ReactNode } from 'react';
import type { Workout } from '../../src/types/workout';

const user = { uid: 'modal-test-user' };
const router = { back: () => undefined };
const alertCalls: Array<[string, string?]> = [];
const created: Array<{ uid: string; data: Record<string, unknown> }> = [];
const updated: Array<{ uid: string; id: string; data: Workout }> = [];
let params: { id?: string; suggestion?: string; mode?: string } = {};
let storedWorkout: Workout | null = null;
let holdById = false;
let releaseById: (() => void) | null = null;
let readError: Error | null = null;

const record = (data: Workout) => ({
  id: data.id,
  data,
  syncState: 'synced' as const,
  serverVersion: null,
  updatedAt: '2026-08-27T00:00:00.000Z',
  deleted: false,
});

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../../src/data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: {
    get: async () => ({ data: {} }),
  },
}));
mock.module(new URL('../../src/data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async () => (storedWorkout ? [record(storedWorkout)] : []),
    getById: async (_uid: string, id: string) => {
      if (holdById) await new Promise<void>((resolve) => { releaseById = resolve; });
      if (readError) throw readError;
      return storedWorkout?.id === id ? record(storedWorkout) : null;
    },
    getByStatus: async () => [],
    create: async (uid: string, data: Record<string, unknown>) => {
      created.push({ uid, data });
      return 'created-workout';
    },
    update: async (uid: string, id: string, data: Workout) => {
      updated.push({ uid, id, data });
    },
  },
}));
mock.module('@/data/sync-trigger', () => ({ triggerSyncAfterWrite: () => undefined }));
mock.module('@/lib/alert', () => ({ showAlert: (title: string, message?: string) => alertCalls.push([title, message]) }));
const injuriesMock = () => ({
  getOngoingInjuryIds: async () => [],
  getOngoingInjuries: async () => [],
});
mock.module('@/lib/injuries', injuriesMock);
mock.module(new URL('../../src/lib/injuries.web.ts', import.meta.url).pathname, injuriesMock);
mock.module('@/hooks/use-exercise-catalog', () => ({ useExerciseCatalog: () => ({ options: [] }) }));
mock.module('@/lib/use-ai-enabled', () => ({ useAIEnabled: () => false }));
mock.module('@/lib/use-ai-connectivity', () => ({ useAIGenerationAvailable: () => false }));
mock.module('@/lib/use-ai-quota', () => ({ useAIQuota: () => ({ usesLeft: 0 }) }));
mock.module('@/lib/predict-next-workout', () => ({ predictNextWorkoutName: () => null }));
mock.module('@/lib/workout-suggestions', () => ({
  generateSplitWorkoutNames: async () => [],
  suggestedExercisesToDraftRows: () => [],
  suggestWorkoutCompletion: async () => ({ suggestions: [] }),
}));
mock.module('@/lib/create-pending-exercise', () => ({ createPendingExercise: async () => undefined }));
mock.module('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
mock.module('@expo/vector-icons', () => ({ Ionicons: () => null }));
mock.module('expo-router', () => ({ router, useLocalSearchParams: () => params }));
mock.module('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
type Build = { module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void };
// The shared preload registers a passthrough list; this screen test needs the
// real header/items/footer render seam while still avoiding native drag logic.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'modal-test-reorderable-list',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: { router, useLocalSearchParams: () => params },
      loader: 'object',
    }));
    const List = ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => ReactNode;
      ListHeaderComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
    }) => (
      <div>
        {ListHeaderComponent}
        {data.map((item, index) => <React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>)}
        {ListFooterComponent}
      </div>
    );
    build.module('react-native-reorderable-list', () => ({
      exports: { default: List, ReorderableList: List, reorderItems: (items: unknown[]) => items },
      loader: 'object',
    }));
  },
});
mock.module('@/ui/primitives/toast', () => ({ Toast: () => null }));
mock.module('@/ui/primitives/workout-prefill-loader', () => ({ WorkoutPrefillLoader: ({ workoutName }: { workoutName: string | null }) => <div>Preparing {workoutName}</div> }));
mock.module('@/ui/primitives/dropdown', () => ({
  Dropdown: ({ placeholder }: { placeholder: string }) => <button>{placeholder}</button>,
}));
mock.module('@/ui/workout/exercise-card', () => ({
  ExerciseCard: ({ index, onSelectExercise, canLinkNext, linkedToNext, onToggleSuperset, onChangeSetType, onAddSubSet, onRemoveSubSet }: {
    index: number;
    onSelectExercise: (index: number, selection: unknown) => void;
    canLinkNext?: boolean;
    linkedToNext?: boolean;
    onToggleSuperset?: (index: number) => void;
    onChangeSetType?: (index: number, setIdx: number, type: string) => void;
    onAddSubSet?: (index: number, setIdx: number) => void;
    onRemoveSubSet?: (index: number, setIdx: number, stage: number) => void;
  }) => (
    <>
      <button onClick={() => onSelectExercise(index, { exerciseId: 'bench-press', variationId: null, label: 'Bench Press' })}>
        Choose Bench Press
      </button>
      {canLinkNext && (
        <button onClick={() => onToggleSuperset?.(index)}>{linkedToNext ? 'Unlink superset' : 'Make a superset'}</button>
      )}
      <button onClick={() => onChangeSetType?.(index, 0, 'drop')}>Make first set a drop</button>
      <button onClick={() => onAddSubSet?.(index, 0)}>Add drop</button>
      <button onClick={() => onRemoveSubSet?.(index, 0, 1)}>Remove first drop</button>
    </>
  ),
}));
// Headless picker behind "Add Exercise": shows its choice only while open, then closes.
mock.module('@/ui/primitives/exercise-picker', () => ({
  ExercisePicker: ({ open, onSelect, onClose }: { open?: boolean; onSelect: (selection: unknown) => void; onClose?: () => void }) =>
    open ? (
      <button onClick={() => { onSelect({ exerciseId: 'bench-press', variationId: null, label: 'Bench Press' }); onClose?.(); }}>
        Pick Bench Press
      </button>
    ) : null,
}));
mock.module('@react-native-community/datetimepicker', () => ({ default: () => null }));

const { default: AddWorkoutModal } = await import('../../app/modal');

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    userId: user.uid,
    name: 'Push Day',
    date: '2026-08-20T12:00:00.000Z',
    performedExercises: [{
      order: 0,
      exerciseId: 'bench-press',
      exerciseRefPath: 'exercises/bench-press',
      exerciseNameSnapshot: 'Bench Press',
      variationId: null,
      variationNameSnapshot: null,
      sets: [{ setNumber: 1, reps: 8, weight: 20, bodyweight: false }],
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
  params = {};
  storedWorkout = null;
  holdById = false;
  releaseById = null;
  readError = null;
  alertCalls.length = 0;
  created.length = 0;
  updated.length = 0;
});

afterEach(() => {
  cleanup();
  releaseById?.();
  releaseById = null;
  holdById = false;
});

describe('AddWorkoutModal', () => {
  it('renders the empty log baseline and its primary action', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    assert.ok(screen.getByText('Log Workout', { exact: true }));
    assert.ok(screen.getByPlaceholderText('Workout name (e.g. Push Day)'));
    assert.ok(screen.getByText("Today's Workout", { exact: true }));
  });

  it('reports the required-name validation when saving the blank baseline', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    fireEvent.click(screen.getByText('Save Workout', { exact: true }));
    assert.deepEqual(alertCalls, [['Error', 'Please select or enter a workout name.']]);
    assert.equal(created.length, 0);
  });

  it('renders the loading state while an existing workout is fetched', async () => {
    params = { id: 'workout-1' };
    storedWorkout = workout();
    holdById = true;
    render(<AddWorkoutModal />);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('Save Changes', { exact: true }), null);

    await act(async () => {
      releaseById?.();
      releaseById = null;
    });
    await waitFor(() => assert.ok(screen.getByText('Save Changes', { exact: true })));
  });

  it('shows a load error and leaves the edit action available', async () => {
    params = { id: 'workout-1' };
    readError = new Error('offline');
    render(<AddWorkoutModal />);

    await waitFor(() => assert.deepEqual(alertCalls, [['Error', 'Could not load workout details.']]));
    assert.ok(screen.getByText('Edit Workout', { exact: true }));
    assert.ok(screen.getByText('Save Changes', { exact: true }));
  });

  it('persists logged sets without a completed key', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    fireEvent.change(screen.getByPlaceholderText('Workout name (e.g. Push Day)'), { target: { value: 'Push Day' } });
    assert.equal(screen.queryByText('Choose Bench Press', { exact: true }), null, 'no empty exercise card before a pick');
    fireEvent.click(screen.getByText('Add Exercise', { exact: true }));
    fireEvent.click(screen.getByText('Pick Bench Press', { exact: true }));
    await settle();
    assert.ok(screen.getByText('Choose Bench Press', { exact: true }), 'the card appears once an exercise is picked');
    fireEvent.click(screen.getByText('Save Workout', { exact: true }));

    await waitFor(() => assert.equal(created.length, 1));
    const data = created[0]!.data as { performedExercises: Workout['performedExercises']; durationSeconds: number | null };
    assert.equal(data.performedExercises.length, 1);
    assert.equal('completed' in data.performedExercises[0]!.sets[0]!, false);
    assert.equal(data.durationSeconds, null, 'manual history starts without an elapsed session');
  });

  it('persists a superset as a shared supersetId on adjacent exercises', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    fireEvent.change(screen.getByPlaceholderText('Workout name (e.g. Push Day)'), { target: { value: 'Push Day' } });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('Add Exercise', { exact: true }));
      fireEvent.click(screen.getByText('Pick Bench Press', { exact: true }));
      await settle();
    }
    // Link 1→2 and 2→3, then split 2|3 again: only the first two stay grouped.
    fireEvent.click(screen.getAllByText('Make a superset', { exact: true })[0]!);
    fireEvent.click(screen.getAllByText('Make a superset', { exact: true })[0]!);
    fireEvent.click(screen.getAllByText('Unlink superset', { exact: true })[1]!);
    fireEvent.click(screen.getByText('Save Workout', { exact: true }));

    await waitFor(() => assert.equal(created.length, 1));
    const [a, b, c] = (created[0]!.data as { performedExercises: Workout['performedExercises'] }).performedExercises;
    assert.ok(a!.supersetId);
    assert.equal(b!.supersetId, a!.supersetId);
    assert.notEqual(c!.supersetId, b!.supersetId);
  });

  it('persists a drop set as parts sharing a set number, and simple sets stay untyped', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    fireEvent.change(screen.getByPlaceholderText('Workout name (e.g. Push Day)'), { target: { value: 'Push Day' } });
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('Add Exercise', { exact: true }));
      fireEvent.click(screen.getByText('Pick Bench Press', { exact: true }));
      await settle();
    }
    fireEvent.click(screen.getAllByText('Make first set a drop', { exact: true })[0]!);
    fireEvent.click(screen.getByText('Save Workout', { exact: true }));

    await waitFor(() => assert.equal(created.length, 1));
    const [typed, plain] = (created[0]!.data as { performedExercises: Workout['performedExercises'] }).performedExercises;
    // Choosing Drop set adds its first drop; both parts are stored as set 1.
    assert.deepEqual(typed!.sets.map((set) => [set.setNumber, set.type]), [[1, 'drop'], [1, 'drop']]);
    assert.equal('type' in plain!.sets[0]!, false);
  });

  it('adds and removes drops, and removing the last drop makes it a simple set again', async () => {
    render(<AddWorkoutModal />);
    await waitFor(() => assert.ok(screen.getByText('Save Workout', { exact: true })));

    fireEvent.change(screen.getByPlaceholderText('Workout name (e.g. Push Day)'), { target: { value: 'Push Day' } });
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('Add Exercise', { exact: true }));
      fireEvent.click(screen.getByText('Pick Bench Press', { exact: true }));
      await settle();
    }
    const [first, second] = [0, 1];
    fireEvent.click(screen.getAllByText('Make first set a drop', { exact: true })[first]!);
    fireEvent.click(screen.getAllByText('Add drop', { exact: true })[first]!);
    fireEvent.click(screen.getAllByText('Make first set a drop', { exact: true })[second]!);
    fireEvent.click(screen.getAllByText('Remove first drop', { exact: true })[second]!);
    fireEvent.click(screen.getByText('Save Workout', { exact: true }));

    await waitFor(() => assert.equal(created.length, 1));
    const [dropped, reverted] = (created[0]!.data as { performedExercises: Workout['performedExercises'] }).performedExercises;
    assert.deepEqual(dropped!.sets.map((set) => [set.setNumber, set.type]), [[1, 'drop'], [1, 'drop'], [1, 'drop']]);
    assert.deepEqual(reverted!.sets.map((set) => [set.setNumber, set.type]), [[1, undefined]]);
  });

  it('reads and writes the web date using the documented UTC-date/local-noon contract', async () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = 'America/Toronto';
    params = { id: 'workout-1' };
    storedWorkout = workout({ durationSeconds: 123 });
    try {
      render(<AddWorkoutModal />);
      await waitFor(() => assert.ok(screen.getByText('Save Changes', { exact: true })));

      const dateInput = screen.getByDisplayValue('2026-08-20') as HTMLInputElement;
      assert.equal(dateInput.type, 'date');
      fireEvent.change(dateInput, { target: { value: '2026-08-25' } });
      fireEvent.click(screen.getByText('Save Changes', { exact: true }));

      await waitFor(() => assert.equal(updated.length, 1));
      const expected = new Date(2026, 7, 25, 12, 0, 0, 0).toISOString();
      assert.equal(updated[0]!.data.date, expected);
      assert.equal(updated[0]!.data.durationSeconds, 123, 'manual edits preserve recorded duration');
    } finally {
      if (previousTZ === undefined) delete process.env.TZ;
      else process.env.TZ = previousTZ;
    }
  });
});
