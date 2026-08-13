// Web build of src/data/workout-repository.ts (Metro picks this file automatically
// on web). Same consumer-facing shape as the native repo — every method
// takes the same args and returns the same StoredRecord<Workout> shape. No
// SQLite here: every call is a live direct Firestore REST request.
import { StoredRecord } from '@/data/remote-types';
import { createVersionCache } from '@/data/version-cache';
import { invalidateWebReads, listWebEntities, webFirestore } from './web-direct-firestore';
import { Workout, WorkoutStatus } from '@/types/workout';
import { WorkoutDTO } from '@timber/contract/api';
import { toDateObj } from '@/lib/workout-conversion';
import { randomId } from './id';

const versions = createVersionCache();
const ENTITY_TYPE = 'workout';

// The remote list arrives ordered by updatedAt (src/data/firestore-sync-remote.ts) —
// right for sync cursors, wrong for display. Native gets its order from SQL
// (src/data/workouts.ts:53/69 date DESC, :81 date ASC) and callers rely on it:
// app/(tabs)/index.tsx slices "the 30 most recent" straight off getHistory.
// date is a FlexibleTimestamp, so compare through toDateObj rather than as text.
function byDate(direction: 'asc' | 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: WorkoutDTO, b: WorkoutDTO) =>
    sign * ((toDateObj(a.date)?.getTime() ?? 0) - (toDateObj(b.date)?.getTime() ?? 0));
}

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

export const workoutRepository = {
  async getAll(uid: string): Promise<StoredRecord<Workout>[]> {
    const items = await listWebEntities(uid, 'workout') as WorkoutDTO[];
    return items.sort(byDate('desc')).map((dto) => toStoredRecord(uid, dto));
  },

  async getHistory(uid: string): Promise<StoredRecord<Workout>[]> {
    const items = await listWebEntities(uid, 'workout') as WorkoutDTO[];
    return items
      .filter((dto) => dto.date !== undefined)
      .sort(byDate('desc'))
      .map((dto) => toStoredRecord(uid, dto));
  },

  async getByStatus(uid: string, status: WorkoutStatus): Promise<StoredRecord<Workout>[]> {
    const items = (await listWebEntities(uid, 'workout') as WorkoutDTO[]).filter((item) => item.status === status);
    return items.sort(byDate('asc')).map((dto) => toStoredRecord(uid, dto));
  },

  async getById(uid: string, id: string): Promise<StoredRecord<Workout> | null> {
    const dto = (await listWebEntities(uid, 'workout') as WorkoutDTO[]).find((item) => item.id === id);
    return dto ? toStoredRecord(uid, dto) : null;
  },

  async create(uid: string, workout: Omit<Workout, 'id' | 'userId'>): Promise<string> {
    const id = randomId(); // same client-supplied-id pattern as native, and the contract's idempotent-retry mechanism
    const dto = (await webFirestore(uid).workouts.create({ ...workout, id, userId: uid, schemaVersion: 2 }, id)).data;
    toStoredRecord(uid, dto);
    invalidateWebReads();
    return id;
  },

  async update(uid: string, id: string, workout: Workout): Promise<void> {
    const dto = (await webFirestore(uid).workouts.update(id, workout, versions.require(id, ENTITY_TYPE))).data;
    toStoredRecord(uid, dto);
    invalidateWebReads();
  },

  async softDelete(uid: string, id: string): Promise<void> {
    await webFirestore(uid).workouts.delete(id, versions.require(id, ENTITY_TYPE));
    versions.delete(id);
    invalidateWebReads();
  },

  async reorderQueue(_uid: string, orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map(async (id, i) => {
      const row = await this.getById(_uid, id);
      if (row) await this.update(_uid, id, { ...row.data, queueOrder: i });
    }));
  },
};
