import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';
import type { CatalogExercise } from '@/types/workout';

const uid = 'pending-exercise-test-user';
type PendingCall = { uid: string; exercise: CatalogExercise };
let pendingError: Error | null = null;
const pendingCalls: PendingCall[] = [];
let pendingAttempts = 0;

mock.module(new URL('../data/catalog-repository.web.ts', import.meta.url).pathname, () => ({
  catalogRepository: {
    createPending: async (requestedUid: string, exercise: CatalogExercise) => {
      pendingAttempts += 1;
      if (pendingError) throw pendingError;
      pendingCalls.push({ uid: requestedUid, exercise });
    },
  },
}));

const { createPendingExercise } = await import('./create-pending-exercise');

afterEach(() => {
  pendingError = null;
  pendingCalls.length = 0;
  pendingAttempts = 0;
});

describe('createPendingExercise', () => {
  it('rejects a blank name before reaching the catalog repository', async () => {
    await assert.rejects(createPendingExercise('   ', uid), /Exercise name is required/);
    assert.deepEqual(pendingCalls, []);
    assert.equal(pendingAttempts, 0);
  });

  it('trims the name and creates the expected identity, ref, and pending payload', async () => {
    // Identity is generated from the slug plus a timestamp, while the visible
    // ref and pending catalog payload both retain the trimmed name.
    const ref = await createPendingExercise('  Dumbbell Bench Press!!  ', uid);
    const created = pendingCalls[0] as PendingCall;

    assert.equal(pendingAttempts, 1);
    assert.equal(created.uid, uid);
    assert.equal(created.exercise.id, ref.exerciseId);
    assert.match(created.exercise.id, /^pending-dumbbell-bench-press-[a-z0-9]+$/);
    assert.deepEqual(ref, {
      exerciseId: created.exercise.id,
      variationId: null,
      label: 'Dumbbell Bench Press!!',
    });
    assert.deepEqual(created.exercise, {
      id: created.exercise.id,
      name: 'Dumbbell Bench Press!!',
      normalizedName: 'dumbbell bench press!!',
      aliases: [],
      primaryMuscles: [],
      secondaryMuscles: [],
      movementPattern: '',
      equipment: [],
      bodyRegion: 'full_body',
      mechanics: 'compound',
      forceType: 'mixed',
      trackingModes: ['reps_weight'],
      variations: [],
      schemaVersion: 2,
      status: 'pending_review',
      createdBy: uid,
      createdAt: created.exercise.createdAt,
      updatedAt: created.exercise.updatedAt,
    });
    assert.equal(created.exercise.createdAt, created.exercise.updatedAt);
    assert.ok(typeof created.exercise.createdAt === 'string');
  });

  it('preserves a repository failure after one attempted payload', async () => {
    // Callers can keep their own UI retry behavior; this helper does not
    // swallow the injected repository error.
    pendingError = new Error('catalog unavailable');

    await assert.rejects(createPendingExercise('Cable Row', uid), /catalog unavailable/);
    assert.equal(pendingAttempts, 1);
    assert.equal(pendingCalls.length, 0);
  });
});
