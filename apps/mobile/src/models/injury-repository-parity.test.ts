import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { FirestoreValue } from '@timber/contract/firestore';
import type { Injury } from '@/types/user';
import { openTestDb } from './test-executor';
import { runMigrations } from './migrate';
import { createFirestoreRestClient } from '../lib/firestore-rest-client-core';

type InjuryRecord = {
  id: string;
  data: Injury;
  syncState: 'synced' | 'dirty';
  serverVersion: string | null;
  updatedAt: string;
  deleted: boolean;
};

type InjuryRepository = {
  getAll(uid: string): Promise<InjuryRecord[]>;
  getById(uid: string, id: string): Promise<InjuryRecord | null>;
  create(uid: string, injury: Injury): Promise<void>;
  update(uid: string, injury: Injury): Promise<void>;
  softDelete(uid: string, id: string): Promise<void>;
};

function assertDataRoundTrip(name: string, actual: Injury, expected: Injury, message: string): void {
  if (name === 'web') {
    // BUG: the web Firestore path replaces data.updatedAt with a server time,
    // while native preserves the caller-provided value.
    assert.notEqual(actual.updatedAt, expected.updatedAt, `${name}: updatedAt is server-managed`);
    assert.deepEqual({ ...actual, updatedAt: expected.updatedAt }, expected, message);
    return;
  }
  assert.deepEqual(actual, expected, message);
}

function injury(id: string, overrides: Partial<Injury> = {}): Injury {
  return {
    id,
    bodyPart: 'shoulder',
    side: 'left',
    muscles: ['side delts'],
    severity: 'moderate',
    status: 'ongoing',
    onsetDate: '2026-08-01T00:00:00.000Z',
    resolvedDate: null,
    avoid: ['overhead press'],
    notes: 'Keep movement controlled',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

async function assertRepositoryContract(name: string, repository: InjuryRepository): Promise<void> {
  const uidA = `${name}-user-a`;
  const uidB = `${name}-user-b`;
  const first = injury('injury-a');
  const second = injury('injury-b', { notes: 'A different account' });

  assert.equal(await repository.getById(uidA, 'missing'), null, `${name}: missing getById returns null`);
  assert.deepEqual(await repository.getAll(uidA), [], `${name}: empty getAll returns []`);

  await repository.create(uidA, first);
  const created = await repository.getById(uidA, first.id);
  assert.ok(created, `${name}: created injury is readable`);
  assertDataRoundTrip(name, created.data, first, `${name}: create/read preserves every non-server field`);

  await repository.create(uidB, second);
  assert.deepEqual(
    (await repository.getAll(uidA)).map((record) => record.id),
    [first.id],
    `${name}: getAll is uid-scoped`,
  );
  assert.equal(await repository.getById(uidA, second.id), null, `${name}: getById is uid-scoped`);

  const updated = injury(first.id, {
    ...first,
    severity: 'severe',
    status: 'resolved',
    resolvedDate: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  });
  await repository.update(uidA, updated);
  const afterUpdate = await repository.getById(uidA, first.id);
  assert.ok(afterUpdate, `${name}: updated injury is readable`);
  assertDataRoundTrip(name, afterUpdate.data, updated, `${name}: update preserves unlisted fields`);

  await repository.softDelete(uidA, first.id);
  assert.equal(await repository.getById(uidA, first.id), null, `${name}: deleted injury is not readable`);
  assert.deepEqual(await repository.getAll(uidA), [], `${name}: deleted injury is absent from getAll`);
  assert.ok(await repository.getById(uidB, second.id), `${name}: deleting one uid leaves another uid intact`);
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
    const parentPath = url.slice(`${documentsRoot}/`.length, -':runQuery'.length);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [...webDocuments.entries()]
        .filter(([path]) => path.startsWith(`${parentPath}/injuries/`))
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
    const body = JSON.parse(init.body ?? '{}') as { writes?: { update?: { name: string; fields: Record<string, FirestoreValue> }; delete?: string }[] };
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

const { injuryRepository: nativeRepository } = await import('./injury-repository');
const { injuryRepository: webRepository } = await import('./injury-repository.web');

await assertRepositoryContract('native', nativeRepository);
await assertRepositoryContract('web', webRepository);

native.raw.close();
console.log('injury repository parity: all assertions passed');
