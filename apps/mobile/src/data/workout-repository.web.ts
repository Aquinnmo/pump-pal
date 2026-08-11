// Web build of src/data/workout-repository.ts (Metro picks this file automatically
// on web). Same consumer-facing shape as the native repo — every method
// takes the same args and returns the same StoredRecord<Workout> shape — so
// call sites (bead pump-pal-bkp.9) never branch on platform. No SQLite here:
// every call is a live request through src/data/remote/workouts.ts.
import { StoredRecord } from '@/data/remote-types';
import { createVersionCache } from '@/data/version-cache';
import * as remote from '@/data/remote/workouts';
import { ApiNotFoundError } from '@/lib/api-client';
import { Workout, WorkoutStatus } from '@/types/workout';
import { WorkoutDTO, CreateWorkoutInput } from '@timber/contract/api';
import { randomId } from './id';

const versions = createVersionCache();
const ENTITY_TYPE = 'workout';

function dtoToWorkout(uid: string, dto: WorkoutDTO): Workout {
  return {
    id: dto.id,
    userId: uid,
    name: dto.name,
    date: dto.date as Workout['date'],
    notes: dto.notes,
    performedExercises: dto.performedExercises as Workout['performedExercises'],
    schemaVersion: 2,
    status: dto.status,
    queueOrder: dto.queueOrder,
    startedAt: dto.startedAt,
    injuries: dto.injuries,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toStoredRecord(uid: string, dto: WorkoutDTO): StoredRecord<Workout> {
  versions.set(dto.id, dto.version);
  return {
    id: dto.id,
    data: dtoToWorkout(uid, dto),
    syncState: 'synced', // web has no local cache to be dirty — every read is the server's current state
    serverVersion: dto.version,
    updatedAt: dto.updatedAt,
    deleted: false,
  };
}

function toCreateInput(id: string, workout: Omit<Workout, 'id' | 'userId'>): CreateWorkoutInput {
  return {
    id,
    name: workout.name,
    date: typeof workout.date === 'string' ? workout.date : undefined,
    status: workout.status ?? 'completed',
    notes: workout.notes,
    performedExercises: (workout.performedExercises ?? []) as CreateWorkoutInput['performedExercises'],
    injuries: workout.injuries,
  };
}

export const workoutRepository = {
  async getAll(uid: string): Promise<StoredRecord<Workout>[]> {
    const { items } = await remote.listWorkouts();
    return items.map((dto) => toStoredRecord(uid, dto));
  },

  async getHistory(uid: string): Promise<StoredRecord<Workout>[]> {
    const { items } = await remote.listWorkouts({ status: 'completed' });
    return items.filter((dto) => dto.date !== undefined).map((dto) => toStoredRecord(uid, dto));
  },

  async getByStatus(uid: string, status: WorkoutStatus): Promise<StoredRecord<Workout>[]> {
    const { items } = await remote.listWorkouts({ status });
    return items.map((dto) => toStoredRecord(uid, dto));
  },

  async getById(uid: string, id: string): Promise<StoredRecord<Workout> | null> {
    try {
      const dto = await remote.getWorkout(id);
      return toStoredRecord(uid, dto);
    } catch (err) {
      if (err instanceof ApiNotFoundError) return null;
      throw err;
    }
  },

  async create(uid: string, workout: Omit<Workout, 'id' | 'userId'>): Promise<string> {
    const id = randomId(); // same client-supplied-id pattern as native, and the contract's idempotent-retry mechanism
    const dto = await remote.createWorkout(toCreateInput(id, workout));
    toStoredRecord(uid, dto);
    return id;
  },

  async update(uid: string, id: string, workout: Workout): Promise<void> {
    const dto = await remote.updateWorkout(id, {
      name: workout.name,
      date: typeof workout.date === 'string' ? workout.date : undefined,
      status: workout.status,
      notes: workout.notes,
      performedExercises: workout.performedExercises as never,
      injuries: workout.injuries,
      baseVersion: versions.require(id, ENTITY_TYPE),
    });
    toStoredRecord(uid, dto);
  },

  async softDelete(uid: string, id: string): Promise<void> {
    await remote.deleteWorkout(id, versions.require(id, ENTITY_TYPE));
    versions.delete(id);
  },

  async reorderQueue(_uid: string, orderedIds: string[]): Promise<void> {
    await remote.reorderWorkouts({
      order: orderedIds.map((id, i) => ({ id, queueOrder: i })),
    });
  },
};
