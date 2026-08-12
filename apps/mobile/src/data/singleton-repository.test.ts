import assert from 'node:assert/strict';
import { runMigrations } from './migrate';
import { openTestDb } from './test-executor';
import { createSingletonRepository } from './singleton-repository';
import { listAll } from './outbox';
import { UserDoc } from '@/types/user';

async function main() {
  const { db } = openTestDb();
  await runMigrations(db);
  const getDb = async () => db;
  const profile = createSingletonRepository<UserDoc>(getDb, 'profile', 'profile');

  // --- get() on a user who never onboarded returns null, not an error ---
  assert.equal(await profile.get('u1'), null);

  // --- upsert with existing Firestore-shaped ({seconds,nanoseconds}) timestamp data ---
  const firestoreShaped: UserDoc = {
    workoutSplit: {
      type: 'Push / Pull / Legs',
      custom: null,
      updatedAt: { seconds: 1750000000, nanoseconds: 0 } as any,
    },
    injuries: [
      {
        id: 'inj1',
        bodyPart: 'shoulder' as any,
        severity: 'mild',
        status: 'ongoing',
        onsetDate: { seconds: 1740000000, nanoseconds: 500000000 } as any,
        createdAt: { seconds: 1740000000, nanoseconds: 0 } as any,
        updatedAt: { seconds: 1740000000, nanoseconds: 0 } as any,
      },
    ],
  };
  await profile.upsert('u1', firestoreShaped);
  const stored = await profile.get('u1');
  assert.ok(stored);
  // Timestamp-shaped fields normalize to real ISO strings, not left as objects.
  assert.equal(stored!.data.workoutSplit!.updatedAt, new Date(1750000000 * 1000).toISOString());
  assert.equal(
    stored!.data.injuries![0].onsetDate,
    new Date(1740000000 * 1000 + 500).toISOString()
  );
  assert.equal(stored!.syncState, 'dirty');
  assert.equal(stored!.deleted, false);

  // A user-originated write must queue a coalesced outbox intent.
  const outboxRows = await listAll(db, 'u1');
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].entityType, 'profile');
  assert.equal(outboxRows[0].op, 'update');

  // --- upsert again with ISO wire data (as a future API response would send) is idempotent ---
  const isoShaped: UserDoc = {
    workoutSplit: {
      type: 'Upper / Lower',
      custom: null,
      updatedAt: '2026-01-01T00:00:00.000Z' as any,
    },
  };
  await profile.upsert('u1', isoShaped, { syncState: 'synced', serverVersion: 'v7' });
  const afterServerWrite = await profile.get('u1');
  assert.equal(afterServerWrite!.data.workoutSplit!.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(afterServerWrite!.syncState, 'synced');
  assert.equal(afterServerWrite!.serverVersion, 'v7');
  // A server-applied write must not queue another outbox intent.
  assert.equal((await listAll(db, 'u1')).length, 1, 'stale outbox row from the dirty write remains, no new one added');

  // --- UID isolation ---
  await profile.upsert('u2', { workoutSplit: { type: 'Full Body', custom: null, updatedAt: '2026-01-01T00:00:00.000Z' as any } });
  assert.equal((await profile.get('u1'))!.data.workoutSplit!.type, 'Upper / Lower');
  assert.equal((await profile.get('u2'))!.data.workoutSplit!.type, 'Full Body');

  console.log('src/data/singleton-repository.test.ts: all assertions passed');
}

main();
