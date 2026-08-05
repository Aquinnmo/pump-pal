// Web build of db/catalog-repository.ts. Same method names as native
// (getAll/getById/replaceAll/createPending/getMeta/setMeta), but there's no
// local cache to replace/persist — every read hits GET /api/catalog fresh
// (the server-side cache-invalidation `version` still avoids re-fetching the
// exercise catalog UI-side, per exercise-catalog.ts's existing AsyncStorage
// version check, which bead pump-pal-bkp.9 wires to this).
import { StoredRecord } from '@/repositories/types';
import * as remote from '@/repositories/remote/catalog';
import { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';
import { CatalogExerciseDTO } from '@/shared/api-contract';

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

export const catalogRepository = { getAll, getById, replaceAll, createPending, getMeta, setMeta };
