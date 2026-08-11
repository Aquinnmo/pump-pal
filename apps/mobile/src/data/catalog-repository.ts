import { getDb } from './client';
import * as catalog from './catalog';
import type { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';
import type { CatalogResponse } from '@timber/contract/api';
import * as remote from '@/data/remote/catalog';

function approvedSnapshot(exercises: CatalogExercise[]): exercises is CatalogExercise[] {
  return (
    exercises.length > 0 &&
    exercises.every((exercise) => exercise.schemaVersion === 2 && !!exercise.name && exercise.status !== 'pending_review')
  );
}

async function refresh(uid: string): Promise<CatalogResponse> {
  const response = await remote.getCatalog();
  const exercises = response.exercises as CatalogExercise[];
  if (!approvedSnapshot(exercises)) {
    throw new Error('Catalog response did not contain a valid approved snapshot.');
  }

  await catalog.replaceSnapshot(await getDb(), uid, exercises, response.version);
  return response;
}

export const catalogRepository = {
  getAll: async (uid: string) => catalog.getAll(await getDb(), uid),
  getById: async (uid: string, id: string) => catalog.getById(await getDb(), uid, id),
  replaceAll: async (uid: string, exercises: CatalogExercise[]) =>
    catalog.replaceAll(await getDb(), uid, exercises),
  createPending: async (uid: string, exercise: CatalogExercise) =>
    catalog.createPending(await getDb(), uid, exercise),
  getMeta: async (uid: string) => catalog.getMeta(await getDb(), uid),
  setMeta: async (uid: string, meta: Pick<ExerciseCatalogMeta, 'version' | 'exerciseCount'>) =>
    catalog.setMeta(await getDb(), uid, meta),
  refresh,
};
