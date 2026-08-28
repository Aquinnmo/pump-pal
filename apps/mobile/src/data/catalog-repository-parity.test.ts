import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { CatalogResponse } from '@timber/contract/api';
import type { CatalogExercise, ExerciseCatalogMeta } from '@/types/workout';
import { openTestDb } from './test-executor';
import { runMigrations } from './migrate';
import { listAll } from './outbox';

type CatalogRecord = {
  id: string;
  data: CatalogExercise;
  syncState: 'synced' | 'dirty';
  serverVersion: string | null;
  updatedAt: string;
  deleted: boolean;
};

type CatalogRepository = {
  getAll(uid: string): Promise<CatalogRecord[]>;
  getById(uid: string, id: string): Promise<CatalogRecord | null>;
  replaceAll(uid: string, exercises: CatalogExercise[]): Promise<void>;
  createPending(uid: string, exercise: CatalogExercise): Promise<void>;
  getMeta(uid: string): Promise<ExerciseCatalogMeta | null>;
  setMeta(uid: string, meta: Pick<ExerciseCatalogMeta, 'version' | 'exerciseCount'>): Promise<void>;
  refresh(uid: string): Promise<CatalogResponse>;
};

function exercise(id: string, name: string, status: CatalogExercise['status'] = 'approved'): CatalogExercise {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    primaryMuscles: ['chest'] as CatalogExercise['primaryMuscles'],
    secondaryMuscles: [],
    movementPattern: 'press',
    equipment: ['barbell'],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps'],
    variations: [],
    schemaVersion: 2,
    status,
  };
}

function response(exercises: CatalogExercise[], version: number): CatalogResponse {
  return { exercises: exercises as CatalogResponse['exercises'], version };
}

const emptyResponse = response([], 0) as unknown as CatalogResponse;
let snapshot: CatalogResponse = emptyResponse;
let snapshotFailure: Error | null = null;
const pendingCalls: { name: string }[] = [];
let pendingFailure: Error | null = null;

// Mock at the repository's direct-read/write boundaries. The native adapter
// still exercises SQLite, transactions, and the durable outbox; the web
// adapter still exercises its mapping and no-cache semantics without a live
// Firestore dependency.
mock.module(new URL('./client.ts', import.meta.url).pathname, () => ({
  getDb: async () => native.db,
}));
mock.module(new URL('./firestore-sync-remote.ts', import.meta.url).pathname, () => ({
  getApprovedCatalogSnapshot: async () => {
    if (snapshotFailure) throw snapshotFailure;
    return snapshot;
  },
}));
mock.module(new URL('../lib/firestore-rest-client.ts', import.meta.url).pathname, () => ({
  firestoreRestClient: () => ({}),
}));
mock.module(new URL('../lib/firestore-rest-client.web.ts', import.meta.url).pathname, () => ({
  firestoreRestClient: () => ({}),
}));
mock.module(new URL('./web-direct-firestore.ts', import.meta.url).pathname, () => ({
  getWebCatalog: async () => {
    if (snapshotFailure) throw snapshotFailure;
    return snapshot;
  },
}));
mock.module(new URL('./remote/catalog.ts', import.meta.url).pathname, () => ({
  createPendingExercise: async (input: { name: string }) => {
    if (pendingFailure) throw pendingFailure;
    pendingCalls.push(input);
    return { exercise: exercise('server-pending', input.name, 'pending_review') };
  },
}));

const native = openTestDb();
await runMigrations(native.db);

const { catalogRepository: nativeRepository } = await import('./catalog-repository');
const { catalogRepository: webRepository } = await import('./catalog-repository.web');

async function assertRepositoryContract(name: 'native' | 'web', repository: CatalogRepository): Promise<void> {
  const uidA = `${name}-user-a`;
  const uidB = `${name}-user-b`;
  const first = exercise('bench-press', 'Bench Press');
  const second = exercise('squat', 'Squat');
  const pending = exercise('user-curl', 'My Curl', 'pending_review');

  // Empty cache and missing reads are ordinary repository results.
  assert.deepEqual(await repository.getAll(uidA), [], `${name}: empty catalog returns []`);
  assert.equal(await repository.getById(uidA, 'missing'), null, `${name}: missing getById returns null`);
  if (name === 'native') {
    assert.equal(await repository.getMeta(uidA), null, 'native: metadata is absent before refresh');
  } else {
    assert.deepEqual(await repository.getMeta(uidA), {
      version: 0,
      exerciseCount: 0,
      schemaVersion: 2,
    }, 'web: metadata mirrors the empty direct snapshot');
  }

  await repository.replaceAll(uidA, [first, second]);
  assert.deepEqual(
    (await repository.getAll(uidA)).map((record) => record.id).sort(),
    name === 'native' ? [first.id, second.id].sort() : [],
    `${name}: replaceAll follows the adapter's cache semantics`,
  );
  if (name === 'native') {
    assert.equal((await repository.getById(uidA, first.id))?.syncState, 'synced');
    assert.deepEqual(await repository.getAll(uidB), [], 'native: catalog cache is uid-scoped');
  } else {
    assert.deepEqual(await repository.getAll(uidB), [], 'web: empty direct snapshot is global');
  }

  await repository.createPending(uidA, pending);
  if (name === 'native') {
    const pendingRecord = await repository.getById(uidA, pending.id);
    assert.ok(pendingRecord, 'native: pending submission is locally readable');
    assert.deepEqual(pendingRecord.data, pending, 'native: pending submission preserves its payload');
    assert.equal(pendingRecord.syncState, 'dirty');
    const outbox = await listAll(native.db, uidA);
    assert.equal(outbox.length, 1, 'native: pending submission queues one outbox intent');
    assert.equal(outbox[0].entityType, 'catalog_exercise');
    assert.equal(outbox[0].entityId, pending.id);
    assert.equal(outbox[0].op, 'create');
    assert.deepEqual(await listAll(native.db, uidB), [], 'native: pending outbox is uid-scoped');
  } else {
    assert.deepEqual(pendingCalls, [{ name: 'My Curl' }], 'web: pending submission forwards only its name');
    assert.equal(await repository.getById(uidA, pending.id), null, 'web: pending submission is not a local catalog row');
  }

  // A cache refresh replaces synced rows but preserves a user's pending row.
  await repository.replaceAll(uidA, [exercise(first.id, 'Bench Press v2'), exercise('deadlift', 'Deadlift')]);
  if (name === 'native') {
    assert.deepEqual(
      (await repository.getAll(uidA)).map((record) => record.id).sort(),
      ['bench-press', 'deadlift', 'user-curl'],
      'native: replaceAll removes stale synced rows and preserves pending rows',
    );
    assert.equal((await repository.getById(uidA, pending.id))?.syncState, 'dirty');
  } else {
    assert.deepEqual((await repository.getAll(uidA)).map((record) => record.data), [], 'web: replaceAll remains a no-op');
  }

  snapshot = response([exercise(first.id, 'Bench Press v3')], 3);
  const refreshed = await repository.refresh(uidA);
  assert.deepEqual(refreshed, snapshot, `${name}: refresh returns the approved snapshot`);
  assert.equal((await repository.getById(uidA, first.id))?.data.name, 'Bench Press v3');
  const refreshedRecord = await repository.getById(uidA, first.id);
  assert.ok(refreshedRecord, `${name}: refreshed exercise is readable`);
  assert.deepEqual(refreshedRecord.data, snapshot.exercises[0], `${name}: refresh preserves every catalog field`);
  assert.equal(refreshedRecord.syncState, 'synced', `${name}: approved catalog rows are synced`);
  assert.equal(refreshedRecord.serverVersion, null, `${name}: catalog rows expose no per-row version`);
  if (name === 'native') {
    assert.equal((await repository.getById(uidA, pending.id))?.syncState, 'dirty');
    assert.deepEqual(await repository.getAll(uidB), [], 'native: refresh remains uid-scoped');
    const nativeMeta = await repository.getMeta(uidA);
    assert.equal(nativeMeta?.version, 3, 'native: refresh persists the snapshot version');
    assert.equal(nativeMeta?.exerciseCount, 1, 'native: refresh persists the exercise count');
  } else {
    assert.equal((await repository.getById(uidA, pending.id)), null, 'web: refresh exposes only the direct snapshot');
    assert.deepEqual((await repository.getAll(uidB)).map((record) => record.data), snapshot.exercises, 'web: approved catalog is global across uids');
    assert.equal((await repository.getMeta(uidA))?.version, 3, 'web: refresh reads the direct snapshot version');
  }

  await repository.setMeta(uidA, { version: 5, exerciseCount: 9 });
  if (name === 'native') {
    assert.equal((await repository.getMeta(uidA))?.version, 5, 'native: setMeta updates the local version');
    assert.equal((await repository.getMeta(uidA))?.exerciseCount, 9);
  } else {
    assert.equal((await repository.getMeta(uidA))?.version, 3, 'web: setMeta does not shadow direct metadata');
  }

  // Invalid server snapshots are rejected by native before they can replace a
  // usable local cache or its metadata. The web direct-read boundary already
  // returns a parsed CatalogResponse, so its adapter propagates boundary
  // failures as-is.
  const beforeFailure = name === 'native' ? await repository.getById(uidA, first.id) : null;
  const beforeVersion = (await repository.getMeta(uidA))?.version;
  if (name === 'native') {
    snapshot = response([exercise('invalid', '')], 6);
    await assert.rejects(
      () => repository.refresh(uidA),
      /valid approved snapshot/,
      'native: invalid snapshot is rejected',
    );
    assert.deepEqual(await repository.getById(uidA, first.id), beforeFailure, 'native: invalid refresh leaves rows intact');
    assert.equal((await repository.getMeta(uidA))?.version, beforeVersion, 'native: invalid refresh leaves metadata intact');
  }

  snapshotFailure = new Error('catalog boundary unavailable');
  await assert.rejects(
    () => repository.refresh(uidA),
    /catalog boundary unavailable/,
    `${name}: refresh boundary failures propagate`,
  );
  if (name === 'native') {
    snapshotFailure = null;
    assert.deepEqual(await repository.getById(uidA, first.id), beforeFailure, 'native: failed refresh leaves rows intact');
    assert.equal((await repository.getMeta(uidA))?.version, beforeVersion, 'native: failed refresh leaves metadata intact');
  } else {
    await assert.rejects(
      () => repository.getAll(uidB),
      /catalog boundary unavailable/,
      'web: getAll failures propagate',
    );
    snapshotFailure = null;
  }

  if (name === 'web') {
    pendingFailure = new Error('pending boundary unavailable');
    await assert.rejects(
      () => repository.createPending(uidA, pending),
      /pending boundary unavailable/,
      'web: pending write failures propagate',
    );
    pendingFailure = null;
  }
}

for (const [name, repository] of [['native', nativeRepository], ['web', webRepository]] as const) {
  snapshot = emptyResponse;
  pendingCalls.length = 0;
  await assertRepositoryContract(name, repository);
}

native.raw.close();
console.log('catalog repository parity: all assertions passed');
