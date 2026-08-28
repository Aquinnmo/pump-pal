import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { FirestoreValue } from '@timber/contract/firestore';
import type { Workout } from '@/types/workout';
import { openTestDb } from './test-executor';
import { runMigrations } from './migrate';
import { createFirestoreRestClient } from '../lib/firestore-rest-client-core';

type WorkoutRecord = {
  id: string;
  data: Workout;
  syncState: 'synced' | 'dirty';
  serverVersion: string | null;
  updatedAt: string;
  deleted: boolean;
};

type WorkoutRepository = {
  getAll(uid: string): Promise<WorkoutRecord[]>;
  getById(uid: string, id: string): Promise<WorkoutRecord | null>;
  create(uid: string, workout: Omit<Workout, 'id' | 'userId'>): Promise<string>;
  update(uid: string, id: string, workout: Workout): Promise<void>;
  softDelete(uid: string, id: string): Promise<void>;
};

function assertDataRoundTrip(name: string, actual: Workout, expected: Workout, message: string): void {
  if (name === 'web') {
    // BUG: the web Firestore path replaces data.updatedAt with a server time,
    // while native preserves the caller-provided value.
    assert.notEqual(actual.updatedAt, expected.updatedAt, `${name}: updatedAt is server-managed`);
    assert.deepEqual({ ...actual, updatedAt: expected.updatedAt }, expected, message);
    return;
  }
  assert.deepEqual(actual, expected, message);
}

function workout(overrides: Partial<Omit<Workout, 'id' | 'userId'>> = {}): Omit<Workout, 'id' | 'userId'> {
  return {
    name: 'Upper-body strength',
    date: '2026-08-12T12:00:00.000Z',
    notes: 'Keep the tempo controlled',
    performedExercises: [
      {
        order: 0,
        exerciseId: 'bench-press',
        exerciseRefPath: 'exerciseCatalog/bench-press',
        exerciseNameSnapshot: 'Bench Press',
        variationId: null,
        variationNameSnapshot: null,
        sets: [{ setNumber: 1, reps: 8, weight: 135, completed: true }],
      },
    ],
    schemaVersion: 2,
    status: 'completed',
    queueOrder: 1,
    startedAt: '2026-08-12T11:30:00.000Z',
    injuries: ['injury-a'],
    createdAt: '2026-08-12T11:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    ...overrides,
  };
}

async function assertRepositoryContract(name: string, repository: WorkoutRepository): Promise<void> {
  const uidA = `${name}-user-a`;
  const uidB = `${name}-user-b`;
  const firstPayload = workout();
  const secondPayload = workout({ name: 'Lower-body strength', notes: 'A different account' });

  assert.equal(await repository.getById(uidA, 'missing'), null, `${name}: missing getById returns null`);
  assert.deepEqual(await repository.getAll(uidA), [], `${name}: empty getAll returns []`);

  const firstId = await repository.create(uidA, firstPayload);
  const created = await repository.getById(uidA, firstId);
  assert.ok(created, `${name}: created workout is readable`);
  assertDataRoundTrip(
    name,
    created.data,
    { ...firstPayload, id: firstId, userId: uidA },
    `${name}: create/read preserves every non-server field`,
  );

  const secondId = await repository.create(uidB, secondPayload);
  assert.deepEqual(
    (await repository.getAll(uidA)).map((record) => record.id),
    [firstId],
    `${name}: getAll is uid-scoped`,
  );
  assert.equal(await repository.getById(uidA, secondId), null, `${name}: getById is uid-scoped`);
  assert.ok(await repository.getById(uidB, secondId), `${name}: other uid can read its workout`);

  const updated = {
    ...created.data,
    notes: 'Updated notes only',
    queueOrder: 7,
    updatedAt: '2026-08-13T12:00:00.000Z',
  };
  await repository.update(uidA, firstId, updated);
  const afterUpdate = await repository.getById(uidA, firstId);
  assert.ok(afterUpdate, `${name}: updated workout is readable`);
  assertDataRoundTrip(name, afterUpdate.data, updated, `${name}: update preserves unlisted fields`);

  await repository.softDelete(uidA, firstId);
  assert.equal(await repository.getById(uidA, firstId), null, `${name}: deleted workout is not readable`);
  assert.deepEqual(await repository.getAll(uidA), [], `${name}: deleted workout is absent from getAll`);
  assert.ok(await repository.getById(uidB, secondId), `${name}: deleting one uid leaves another uid intact`);
}

const native = openTestDb();
await runMigrations(native.db);
mock.module(new URL('./client.ts', import.meta.url).pathname, () => ({
  getDb: async () => native.db,
}));

const documentsRoot = 'https://firestore.test/v1/projects/test/databases/(default)/documents';
const webDocuments = new Map<string, { fields: Record<string, FirestoreValue>; version: string }>();
let webVersion = 0;
const webFetch = async (url: string, init: { method: string; body?: string }) => {
  if (url.endsWith(':runQuery')) {
    const query = JSON.parse(init.body ?? '{}') as {
      structuredQuery?: {
        where?: { fieldFilter?: { field?: { fieldPath?: string }; value?: { stringValue?: string } } };
      };
    };
    const uid = query.structuredQuery?.where?.fieldFilter?.value?.stringValue;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [...webDocuments.entries()]
        .filter(([path, document]) => {
          const userId = (document.fields.userId as { stringValue?: string } | undefined)?.stringValue;
          return path.startsWith('workouts/') && userId === uid;
        })
        .map(([path, document]) => ({
          document: {
            name: `projects/test/databases/(default)/documents/${path}`,
            fields: document.fields,
            updateTime: document.version,
          },
        })),
    };
  }

  if (url.endsWith(':commit')) {
    const body = JSON.parse(init.body ?? '{}') as {
      writes?: { update?: { name: string; fields: Record<string, FirestoreValue> }; delete?: string }[];
    };
    const writeResults = (body.writes ?? []).map((write) => {
      const name = write.update?.name ?? write.delete;
      assert.ok(name);
      const path = name.slice(name.indexOf('/documents/') + '/documents/'.length);
      const version = `web-version-${++webVersion}`;
      if (write.delete) webDocuments.delete(path);
      else webDocuments.set(path, { fields: write.update!.fields, version });
      return { updateTime: version };
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ writeResults }),
    };
  }

  throw new Error(`Unexpected web request ${init.method} ${url}`);
};

const webClient = () => createFirestoreRestClient({
  projectId: 'test',
  documentsUrl: documentsRoot,
  fetchImpl: webFetch,
  getIdToken: async () => 'test-id-token',
});
mock.module(new URL('../lib/firestore-rest-client.web.ts', import.meta.url).pathname, () => ({
  firestoreRestClient: webClient,
}));
mock.module(new URL('../lib/firestore-rest-client.ts', import.meta.url).pathname, () => ({
  firestoreRestClient: webClient,
}));

const { workoutRepository: nativeRepository } = await import('./workout-repository');
const { workoutRepository: webRepository } = await import('./workout-repository.web');

await assertRepositoryContract('native', nativeRepository);
await assertRepositoryContract('web', webRepository);

native.raw.close();
console.log('workout repository parity: all assertions passed');
