import { getDb } from './client';
import * as catalog from './catalog';
import type { CatalogExercise } from '@/types/workout';
import type { CatalogResponse } from '@timber/contract/api';
import { firestoreRestClient } from '@/lib/firestore-rest-client';
import { getApprovedCatalogSnapshot } from './firestore-sync-remote';
import { approvedCatalog } from '@/models/catalog-loader';

async function refresh(uid: string): Promise<CatalogResponse> {
  const response = await getApprovedCatalogSnapshot(firestoreRestClient());
  const exercises = approvedCatalog(response.exercises);
  if (!exercises) {
    throw new Error('Catalog response did not contain a valid approved snapshot.');
  }

  await catalog.replaceSnapshot(await getDb(), uid, exercises, response.version);
  return response;
}

export const catalogRepository = {
  getAll: async (uid: string) => catalog.getAll(await getDb(), uid),
  getById: async (uid: string, id: string) => catalog.getById(await getDb(), uid, id),
  createPending: async (uid: string, exercise: CatalogExercise) =>
    catalog.createPending(await getDb(), uid, exercise),
  getMeta: async (uid: string) => catalog.getMeta(await getDb(), uid),
  refresh,
};
