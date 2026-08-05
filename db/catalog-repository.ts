import { getDb } from './client';
import * as catalog from './catalog';
import { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';

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
};
