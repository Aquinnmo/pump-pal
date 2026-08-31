import assert from 'node:assert/strict';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { makePerformedExercise, makeWorkout } from '@/tests/factories';
import type { Workout } from '@/types/workout';

const user = { uid: 'analytics-controller-test-user' };
let history: Workout[] = [];
const historyCalls: string[] = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../models/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getHistory: async (uid: string) => {
      historyCalls.push(uid);
      return history.map((data) => ({
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

beforeEach(() => {
  history = [makeWorkout({
    userId: user.uid,
    performedExercises: [makePerformedExercise({
      exerciseNameSnapshot: 'Bench Press',
      sets: [{ setNumber: 1, reps: 8, weight: 100, bodyweight: false }],
    })],
  })];
  historyCalls.length = 0;
});

afterEach(() => {
  history = [];
});

describe('useAnalytics', () => {
  it('loads history and computes its summary', async () => {
    const { useAnalytics } = await import('./use-analytics');
    const rendered = renderHook(() => useAnalytics());

    await waitFor(() => assert.deepEqual(rendered.result.current.workouts, history));
    assert.equal(rendered.result.current.summary.favoriteExercise, 'Bench Press');
    assert.equal(rendered.result.current.summary.maxWeights['Bench Press'], 100);
    assert.equal(rendered.result.current.loading, false);
    assert.deepEqual(historyCalls, [user.uid]);

    await act(async () => rendered.unmount());
  });
});
