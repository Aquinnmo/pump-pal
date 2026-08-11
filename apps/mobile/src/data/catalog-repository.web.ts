// Web build of src/data/catalog-repository.ts. Same method names as native
// (getAll/getById/replaceAll/createPending/getMeta/setMeta), but there's no
// local cache to replace/persist — every read hits GET /api/catalog fresh
// (the server-side cache-invalidation `version` still avoids re-fetching the
// exercise catalog UI-side, per exercise-catalog.ts's existing AsyncStorage
// version check, which bead pump-pal-bkp.9 wires to this).
import type { StoredRecord } from '@/data/remote-types';
import * as remote from '@/data/remote/catalog';
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
  const { exercises } = await remote.getCatalog();
  return exercises.map(toStoredRecord);
}

async function getById(uid: string, id: string): Promise<StoredRecord<CatalogExercise> | null> {
  const all = await getAll(uid);
  return all.find((r) => r.id === id) ?? null;
}

/** No-op on web — there's no local cache to refresh, GET /api/catalog is always live. */
async function replaceAll(_uid: string, _exercises: CatalogExercise[]): Promise<void> {}

async function createPending(_uid: string, exercise: CatalogExercise): Promise<void> {
  await remote.createPendingExercise({ name: exercise.name });
}

async function getMeta(_uid: string): Promise<ExerciseCatalogMeta | null> {
  const { exercises, version } = await remote.getCatalog();
  return { version, exerciseCount: exercises.length, schemaVersion: 2 };
}

/** No-op on web — meta comes back with every GET /api/catalog, nothing to cache separately. */
async function setMeta(_uid: string, _meta: Pick<ExerciseCatalogMeta, 'version' | 'exerciseCount'>): Promise<void> {}

/** Web has no SQLite cache; catalog responses are already wire-validated by the remote client. */
async function refresh(_uid: string): Promise<CatalogResponse> {
  return remote.getCatalog();
}

export const catalogRepository = { getAll, getById, replaceAll, createPending, getMeta, setMeta, refresh };
