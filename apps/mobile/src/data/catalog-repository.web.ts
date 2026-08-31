// Web build of src/data/catalog-repository.ts. Every approved-catalog read
// hits Firestore directly. Pending submissions remain Worker-only.
import type { StoredRecord } from '@/data/remote-types';
import * as remote from '@/data/remote/catalog';
import { getWebCatalog } from './web-direct-firestore';
import type { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';
import type { CatalogExerciseDTO, CatalogResponse } from '@timber/contract/api';

function toStoredRecord(dto: CatalogExerciseDTO): StoredRecord<CatalogExercise> {
  return {
    id: dto.id,
    data: dto as CatalogExercise,
    syncState: 'synced',
    serverVersion: null,
    updatedAt: new Date().toISOString(),
    deleted: false,
  };
}

async function getAll(_uid: string): Promise<StoredRecord<CatalogExercise>[]> {
  const { exercises } = await getWebCatalog();
  return exercises.map(toStoredRecord);
}

async function getById(uid: string, id: string): Promise<StoredRecord<CatalogExercise> | null> {
  const all = await getAll(uid);
  return all.find((r) => r.id === id) ?? null;
}

async function createPending(_uid: string, exercise: CatalogExercise): Promise<void> {
  await remote.createPendingExercise({ name: exercise.name });
}

async function getMeta(_uid: string): Promise<ExerciseCatalogMeta | null> {
  const { exercises, version } = await getWebCatalog();
  return { version, exerciseCount: exercises.length, schemaVersion: 2 };
}

/** Web has no SQLite cache; catalog responses are already wire-validated by the remote client. */
async function refresh(_uid: string): Promise<CatalogResponse> {
  return getWebCatalog();
}

export const catalogRepository = { getAll, getById, createPending, getMeta, refresh };
