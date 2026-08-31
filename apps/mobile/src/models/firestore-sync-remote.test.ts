import assert from 'node:assert/strict';
import { firestoreDocumentReference, type DecodedFirestoreDocument } from '@timber/contract/firestore';
import { FirestorePermissionError } from '@/lib/firestore-rest-client-core';
import { createFirestoreSyncRemote, type DirectFirestoreClient } from './firestore-sync-remote';
import { SyncPermanentError } from './sync-engine';

const timestamp = '2026-08-12T12:00:00.000Z';

function document(path: string, fields: Record<string, unknown>, version = timestamp): DecodedFirestoreDocument {
  return { path, fields, version } as DecodedFirestoreDocument;
}

function workout(id: string, updatedAt = timestamp) {
  return document(`workouts/${id}`, {
    userId: 'u1', name: 'Push', status: 'completed', performedExercises: [], schemaVersion: 2,
    createdAt: timestamp, updatedAt,
  }, `version-${id}`);
}

class FakeFirestore implements DirectFirestoreClient {
  documents = new Map<string, DecodedFirestoreDocument>();
  commits: Parameters<DirectFirestoreClient['commit']>[0][] = [];
  queries: Parameters<DirectFirestoreClient['runQuery']>[0][] = [];
  rejectCommit: Error | null = null;

  documentReference(path: string) {
    return firestoreDocumentReference(`projects/demo/databases/(default)/documents/${path}`);
  }

  async getDocument(path: string) {
    return this.documents.get(path);
  }

  async commit(writes: Parameters<DirectFirestoreClient['commit']>[0]) {
    this.commits.push(writes);
    if (this.rejectCommit) throw this.rejectCommit;
    return writes.map((write, index) => ({ version: `write-${this.commits.length}-${index}` }));
  }

  async runQuery(query: Parameters<DirectFirestoreClient['runQuery']>[0]) {
    this.queries.push(query);
    const all = [...this.documents.values()].filter((entry) => {
      if (query.collectionId === 'workouts') return entry.path.startsWith('workouts/');
      if (query.collectionId === 'injuries') return entry.path.startsWith(`${query.parentPath}/injuries/`);
      if (query.collectionId === 'exercises') return entry.path.startsWith('exercises/');
      return false;
    });
    const after = query.startAfter ? 200 : 0;
    return all.slice(after, after + query.limit);
  }
}

async function main() {
  const client = new FakeFirestore();
  for (let index = 0; index < 201; index += 1) client.documents.set(`workouts/w${index}`, workout(`w${index}`, `2026-08-12T12:00:${String(index % 60).padStart(2, '0')}.000Z`));
  client.documents.set('users/u1/injuries/i1', document('users/u1/injuries/i1', {
    id: 'i1', bodyPart: 'shoulder', severity: 'mild', status: 'ongoing', onsetDate: timestamp, createdAt: timestamp, updatedAt: timestamp,
  }, 'injury-v1'));
  client.documents.set('users/u1', document('users/u1', { username: 'athlete', workoutSplit: null }, 'profile-v1'));
  client.documents.set('users/u1/pushup-challenge/data', document('users/u1/pushup-challenge/data', { startDate: '2026-08-01', days: [], longestStreak: 0 }, 'pushup-v1'));

  const direct = createFirestoreSyncRemote(client, 'u1');
  const directWorkouts = await direct.workouts.list();
  assert.equal(directWorkouts.length, 201, 'web-safe list reads every bounded query page directly');
  assert.equal(client.queries.filter((query) => query.collectionId === 'workouts').length, 2);

  const queryCountBeforeManifest = client.queries.length;
  const manifest = await direct.remote.manifest('u1', undefined);
  assert.equal(manifest.items.filter((item) => item.kind === 'workout').length, 201, 'all direct-query pages are included');
  assert.equal(client.queries.length - queryCountBeforeManifest, 3, 'the manifest uses one injury query plus two bounded workout pages');
  assert.deepEqual(client.queries[0].where, [{ field: 'userId', op: 'EQUAL', value: 'u1' }]);
  assert.equal(client.queries[0].limit, 200);

  const pulled = await direct.remote.pull([{ kind: 'workout', id: 'w0' }, { kind: 'injury', id: 'i1' }, { kind: 'profile', id: 'u1' }, { kind: 'pushupChallenge', id: 'u1' }]);
  assert.equal(pulled.found.length, 4);
  assert.equal((pulled.found.find((item) => item.kind === 'workout')?.data as { id: string }).id, 'w0');

  const result = await direct.workouts.update('w0', {
    id: 'w0', userId: 'u1', name: 'Edited', status: 'completed', performedExercises: [], schemaVersion: 2, createdAt: timestamp,
  }, 'version-w0');
  assert.equal(result.version, 'write-1-0');
  assert.deepEqual(client.commits[0][0].currentDocument, { updateTime: 'version-w0' });
  assert.ok(client.commits[0][0].updateMask?.includes('userId'));
  assert.equal(client.queries.length, 5, 'a direct mutation does not trigger a redundant full manifest query');

  const commitsBeforeDrafts = client.commits.length;
  await assert.rejects(
    () => direct.workouts.create({ id: 'draft', userId: 'u1', name: 'Draft', status: 'in_progress', performedExercises: [], schemaVersion: 2, createdAt: timestamp }, 'draft'),
    (error: unknown) => error instanceof SyncPermanentError && error.message.includes('must remain local')
  );
  await assert.rejects(
    () => direct.workouts.update('w0', { id: 'w0', userId: 'u1', name: 'Draft edit', status: 'in_progress', performedExercises: [], schemaVersion: 2, createdAt: timestamp }, 'version-w0'),
    (error: unknown) => error instanceof SyncPermanentError && error.message.includes('must remain local')
  );
  assert.equal(client.commits.length, commitsBeforeDrafts, 'draft workout writes never reach Firestore');

  const newAccount = createFirestoreSyncRemote(new FakeFirestore(), 'new-user');
  assert.equal(await newAccount.profile.get(), undefined, 'a new web account has no profile without masking request failures');
  assert.equal((await newAccount.pushup.read()).data.startDate, null, 'a new web account has no pushup challenge');

  client.rejectCommit = new FirestorePermissionError();
  await assert.rejects(
    () => direct.injuries.create({ id: 'i2', bodyPart: 'shoulder', severity: 'mild', status: 'ongoing', onsetDate: timestamp, createdAt: timestamp, updatedAt: timestamp }),
    SyncPermanentError
  );

  console.log('firestore-sync-remote: all assertions passed');
}

void main();
