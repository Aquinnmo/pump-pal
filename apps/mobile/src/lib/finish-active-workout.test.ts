import assert from 'node:assert/strict';
import { mock, test } from 'bun:test';
import type { Workout } from '@/types/workout';

const records = new Map<string, Workout>();
let writes = 0;
let fail = false;
mock.module(new URL('../data/workout-repository.web.ts', import.meta.url).pathname, () => ({ workoutRepository: {
  getById: async (_uid: string, id: string) => records.has(id) ? { data: records.get(id) } : null,
  update: async (_uid: string, id: string, data: Workout) => {
    if (fail) throw new Error('write failed');
    writes++;
    records.set(id, data);
  },
  create: async (_uid: string, data: Workout) => { writes++; records.set('created', data); return 'created'; },
} }));
mock.module(new URL('./injuries.web.ts', import.meta.url).pathname, () => ({ getOngoingInjuryIds: async () => ['shoulder'] }));
mock.module(new URL('../data/sync-trigger.web.ts', import.meta.url).pathname, () => ({ triggerSyncAfterWrite: () => {} }));
mock.module(new URL('./wear-sync.ts', import.meta.url).pathname, () => ({ pushWearState: () => {} }));
const { startSession, getSession, endSession } = await import('./active-workout-session');
const finishModule = './finish-active-workout';
const { finishActiveWorkout } = await import(finishModule);

test('background Finish saves confirmed sets once, survives retry after commit, and preserves failed drafts', async () => {
  const session = startSession({ uid: 'u1', planId: null, name: 'Push', cameFromPlan: false, rows: [{
    uid: 'row', exerciseId: 'bench', variationId: null, label: 'Bench', exerciseType: 'Sets of Reps', bodyweight: false,
    sets: [true, false].map(completed => ({ reps: 8, weight: '135', durationMinutes: 0, durationSeconds: 0, completed })),
  }] });
  const snapshot = { ...session, startedAt: new Date(Date.now() - 10_000).toISOString() };
  await Promise.all([finishActiveWorkout('u1', snapshot, true), finishActiveWorkout('u1', snapshot, true)]);
  assert.equal(writes, 1);
  const saved = records.get(session.id)!;
  assert.equal(saved.performedExercises![0].sets.length, 1);
  assert.equal('completed' in saved.performedExercises![0].sets[0], false);
  assert.deepEqual(saved.injuries, ['shoulder']);
  assert.equal(saved.durationSeconds, 10);
  assert.equal(saved.status, 'completed');
  assert.equal(getSession(), null);
  await finishActiveWorkout('u1', snapshot, true);
  assert.equal(writes, 1, 'retry after a committed save must not create a second workout');

  const retry = startSession({ uid: session.uid, planId: null, name: 'Retry', rows: session.rows, cameFromPlan: false });
  fail = true;
  await assert.rejects(finishActiveWorkout('u1', retry, true), /write failed/);
  assert.equal(getSession()?.id, retry.id);
  fail = false;
  await finishActiveWorkout('u1', retry, true);
  assert.equal(getSession(), null);
  assert.equal(writes, 2);
  endSession();
});
