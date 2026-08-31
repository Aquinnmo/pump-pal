import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { FirestoreValue } from '@timber/contract/firestore';
import type { ChallengeData } from '@/types/pushup-challenge';
import { openTestDb } from './test-executor';
import { runMigrations } from './migrate';
import { createFirestoreRestClient } from '../lib/firestore-rest-client-core';

type PushupRecord = {
  id: string;
  data: ChallengeData;
  syncState: 'synced' | 'dirty';
  serverVersion: string | null;
  updatedAt: string;
  deleted: boolean;
};

type PushupRepository = {
  get(uid: string): Promise<PushupRecord | null>;
  upsert(uid: string, entity: ChallengeData): Promise<void>;
  removeClean?: (uid: string) => Promise<void>;
};

function challenge(overrides: Partial<ChallengeData> = {}): ChallengeData {
  return {
    startDate: '2026-08-12',
    days: [
      { date: '2026-08-12', dayNumber: 1, completedAt: '2026-08-12T12:00:00.000Z' },
      { date: '2026-08-13', dayNumber: 2, completedAt: '2026-08-13T12:00:00.000Z' },
    ],
    longestStreak: 2,
    ...overrides,
  };
}

async function assertRepositoryContract(name: string, repository: PushupRepository): Promise<void> {
  const uidA = `${name}-user-a`;
  const uidB = `${name}-user-b`;
  const first = challenge();
  const second = challenge({ startDate: '2026-08-20', days: [], longestStreak: 0 });

  // A singleton has no collection listing; an empty store is represented by
  // the same null result as a missing document.
  assert.equal(await repository.get(uidA), null, `${name}: missing pushup read returns null`);

  await repository.upsert(uidA, first);
  const created = await repository.get(uidA);
  assert.ok(created, `${name}: created challenge is readable`);
  assert.deepEqual(created.data, first, `${name}: create/read preserves every field`);

  await repository.upsert(uidB, second);
  assert.deepEqual((await repository.get(uidA))!.data, first, `${name}: uid A remains isolated after uid B write`);
  assert.deepEqual((await repository.get(uidB))!.data, second, `${name}: uid B reads only its own challenge`);

  const updated = {
    ...first,
    longestStreak: 5,
  };
  await repository.upsert(uidA, updated);
  const afterUpdate = await repository.get(uidA);
  assert.ok(afterUpdate, `${name}: updated challenge is readable`);
  assert.deepEqual(afterUpdate.data, updated, `${name}: update preserves unlisted fields`);

  // Deletion is a sync-only local operation: the web repository has no delete
  // method because account deletion is privileged and server-owned.
  if (repository.removeClean) {
    await repository.removeClean(uidA);
    assert.equal(await repository.get(uidA), null, `${name}: removeClean hides a deleted challenge`);
  }
  assert.deepEqual((await repository.get(uidB))!.data, second, `${name}: deleting one uid leaves another uid intact`);
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

  if (url.startsWith(`${documentsRoot}/`)) {
    const path = url.slice(`${documentsRoot}/`.length).split('?')[0];
    const document = webDocuments.get(path);
    return {
      ok: !!document,
      status: document ? 200 : 404,
      headers: { get: () => null },
      json: async () => document
        ? {
            name: `projects/test/databases/(default)/documents/${path}`,
            fields: document.fields,
            updateTime: document.version,
          }
        : { error: { message: 'missing' } },
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

const { pushupRepository: nativeRepository } = await import('./pushup-repository');
const { pushupRepository: webRepository } = await import('./pushup-repository.web');

await assertRepositoryContract('native', nativeRepository);
await assertRepositoryContract('web', webRepository);

native.raw.close();
console.log('pushup repository parity: all assertions passed');
