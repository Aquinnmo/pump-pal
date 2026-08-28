import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { StoredRecord } from '@/data/remote-types';
import type { Workout } from '@/types/workout';

const updates: Array<{ uid: string; id: string; workout: Workout }> = [];
const softDeletes: Array<{ uid: string; id: string }> = [];
let stale: StoredRecord<Workout>[] = [];

mock.module(new URL('../data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getByStatus: async () => stale,
    update: async (uid: string, id: string, workout: Workout) => {
      updates.push({ uid, id, workout });
    },
    softDelete: async (uid: string, id: string) => {
      softDeletes.push({ uid, id });
    },
  },
}));

mock.module(new URL('./workout-notification.web.ts', import.meta.url).pathname, () => ({
  dismissWorkoutNotification: async () => {},
}));

mock.module(new URL('./wear-sync.web.ts', import.meta.url).pathname, () => ({
  pushWearState: () => {},
}));

const { sweepLegacyInProgressWorkouts } = await import('./discard-workout');

function record(data: Workout): StoredRecord<Workout> {
  return {
    id: data.id,
    data,
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-08-27T00:00:00.000Z',
    deleted: false,
  };
}

function workout(id: string, queueOrder?: number): Workout {
  return {
    id,
    userId: 'user-1',
    name: id,
    status: 'in_progress',
    ...(queueOrder === undefined ? {} : { queueOrder }),
    startedAt: '2026-08-27T12:00:00.000Z',
    performedExercises: [{
      order: 0,
      exerciseId: 'bench-press',
      exerciseRefPath: 'exercises/bench-press',
      exerciseNameSnapshot: 'Bench Press',
      variationId: null,
      variationNameSnapshot: null,
      sets: [
        { setNumber: 1, reps: 8, weight: 100, completed: true },
        { setNumber: 2, reps: 8, weight: 100, completed: false },
      ],
    }],
    schemaVersion: 2,
  };
}

stale = [record(workout('planned-1', 0)), record(workout('ad-hoc-1'))];
await sweepLegacyInProgressWorkouts('user-1');

// queueOrder !== undefined includes zero: plan-sourced rows are restored to
// planned, completed flags are removed from every set, and startedAt is gone.
assert.equal(updates.length, 1);
assert.equal(updates[0].uid, 'user-1');
assert.equal(updates[0].id, 'planned-1');
assert.equal(updates[0].workout.status, 'planned');
assert.equal(updates[0].workout.queueOrder, 0);
assert.equal(updates[0].workout.startedAt, undefined);
assert.deepEqual(updates[0].workout.performedExercises[0]?.sets, [
  { setNumber: 1, reps: 8, weight: 100 },
  { setNumber: 2, reps: 8, weight: 100 },
]);

// An ad-hoc in-progress row has no queue order and is soft-deleted instead of
// being returned to the planned queue.
assert.deepEqual(softDeletes, [{ uid: 'user-1', id: 'ad-hoc-1' }]);

console.log('discard-workout: all assertions passed');
