import type { CatalogResponse } from '@timber/contract/api';
import type { StoredRecord } from '@/data/remote-types';
import type { CatalogExercise } from '@/types/workout';

type CatalogCache = {
  read: () => Promise<CatalogExercise[] | null>;
  write: (catalog: CatalogExercise[], version: number) => Promise<void>;
};

type CatalogRepository = {
  refresh: (uid: string) => Promise<CatalogResponse>;
  getAll: (uid: string) => Promise<StoredRecord<CatalogExercise>[]>;
};

function approvedCatalog(value: unknown): CatalogExercise[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const catalog = value as CatalogExercise[];
  return catalog.every((exercise) => exercise?.schemaVersion === 2 && !!exercise.name && exercise.status !== 'pending_review')
    ? catalog
    : null;
}

/**
 * Per-JS-session catalog hydration policy. The platform repository owns the
 * backing store; this module stays platform-free so its refresh/fallback
 * invariants can be tested without Expo, Firebase, or AsyncStorage.
 */
export function createCatalogLoader(repository: CatalogRepository, cache: CatalogCache) {
  const successfulSnapshots = new Map<string, CatalogExercise[]>();
  const inFlight = new Map<string, Promise<CatalogExercise[]>>();

  async function loadUncached(uid: string): Promise<CatalogExercise[]> {
    try {
      const response = await repository.refresh(uid);
      const catalog = approvedCatalog(response.exercises);
      if (!catalog) throw new Error('Catalog response did not contain a valid approved snapshot.');

      successfulSnapshots.set(uid, catalog);
      // SQLite has already committed the snapshot at this point. AsyncStorage
      // is only a legacy/offline fallback, so a write failure must not turn a
      // successful network refresh into a retry loop.
      try {
        await cache.write(catalog, response.version);
      } catch {
        // Best effort only.
      }
      return catalog;
    } catch {
      try {
        const local = approvedCatalog((await repository.getAll(uid)).map((record) => record.data));
        if (local) return local;
      } catch {
        // Continue to the older AsyncStorage fallback.
      }

      try {
        return approvedCatalog(await cache.read()) ?? [];
      } catch {
        return [];
      }
    }
  }

  function load(uid: string | null | undefined): Promise<CatalogExercise[]> {
    if (!uid) return Promise.resolve([]);
    const successful = successfulSnapshots.get(uid);
    if (successful) return Promise.resolve(successful);

    const existing = inFlight.get(uid);
    if (existing) return existing;

    const request = loadUncached(uid).finally(() => inFlight.delete(uid));
    inFlight.set(uid, request);
    return request;
  }

  return { load };
}
