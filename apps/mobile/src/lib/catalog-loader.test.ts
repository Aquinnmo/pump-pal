import assert from 'node:assert/strict';
import type { CatalogResponse } from '@timber/contract/api';
import type { StoredRecord } from '@/data/remote-types';
import type { CatalogExercise } from '@/types/workout';
import { createCatalogLoader } from './catalog-loader';

function exercise(id: string): CatalogExercise {
  return {
    id,
    name: id,
    normalizedName: id,
    aliases: [],
    primaryMuscles: ['chest'] as CatalogExercise['primaryMuscles'],
    secondaryMuscles: [],
    movementPattern: 'horizontal_press',
    equipment: ['barbell'],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps_weight'] as unknown as CatalogExercise['trackingModes'],
    variations: [],
    schemaVersion: 2,
  };
}

function response(exercises: CatalogExercise[], version = 1): CatalogResponse {
  return { exercises: exercises as CatalogResponse['exercises'], version };
}

function stored(exercises: CatalogExercise[]): StoredRecord<CatalogExercise>[] {
  return exercises.map((data) => ({
    id: data.id,
    data,
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-08-06T00:00:00Z',
    deleted: false,
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function main() {
// Fresh hydration writes the API snapshot and retains it for this JS session.
{
  let refreshes = 0;
  const writes: CatalogExercise[][] = [];
  const loader = createCatalogLoader(
    {
      refresh: async () => {
        refreshes += 1;
        return response([exercise('bench-press')], 7);
      },
      getAll: async () => [],
    },
    { read: async () => null, write: async (catalog) => void writes.push(catalog) }
  );
  assert.deepEqual(await loader.load('u1'), [exercise('bench-press')]);
  assert.deepEqual(await loader.load('u1'), [exercise('bench-press')]);
  assert.equal(refreshes, 1, 'one successful refresh per uid per JS session');
  assert.equal(writes.length, 1);
}

// Concurrent consumers join one in-flight network refresh.
{
  const nextResponse = deferred<CatalogResponse>();
  let refreshes = 0;
  const loader = createCatalogLoader(
    {
      refresh: () => {
        refreshes += 1;
        return nextResponse.promise;
      },
      getAll: async () => [],
    },
    { read: async () => null, write: async () => {} }
  );
  const first = loader.load('u1');
  const second = loader.load('u1');
  assert.equal(refreshes, 1);
  nextResponse.resolve(response([exercise('squat')]));
  assert.deepEqual(await first, [exercise('squat')]);
  assert.deepEqual(await second, [exercise('squat')]);
}

// Failed hydration uses UID-scoped SQLite before the legacy AsyncStorage cache.
{
  const loader = createCatalogLoader(
    { refresh: async () => Promise.reject(new Error('offline')), getAll: async () => stored([exercise('deadlift')]) },
    { read: async () => [exercise('bench-press')], write: async () => assert.fail('must not write fallback data') }
  );
  assert.deepEqual(await loader.load('u1'), [exercise('deadlift')]);
}

// If SQLite is unavailable, AsyncStorage remains the final offline fallback.
{
  const loader = createCatalogLoader(
    { refresh: async () => Promise.reject(new Error('offline')), getAll: async () => [] },
    { read: async () => [exercise('bench-press')], write: async () => assert.fail('must not write fallback data') }
  );
  assert.deepEqual(await loader.load('u1'), [exercise('bench-press')]);
}

// An empty/invalid response cannot displace a good local snapshot, and its
// failure is not memoized: a later call retries the network refresh.
{
  let refreshes = 0;
  const loader = createCatalogLoader(
    {
      refresh: async () => {
        refreshes += 1;
        return refreshes === 1 ? response([]) : response([exercise('row')]);
      },
      getAll: async () => stored([exercise('bench-press')]),
    },
    { read: async () => null, write: async () => {} }
  );
  assert.deepEqual(await loader.load('u1'), [exercise('bench-press')]);
  assert.deepEqual(await loader.load('u1'), [exercise('row')]);
  assert.equal(refreshes, 2, 'failed refreshes remain retryable');
}

console.log('catalog-loader: all assertions passed');
}

main();
