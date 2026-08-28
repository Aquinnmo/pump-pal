import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'bun:test';
import type { Workout } from '@/types/workout';

type WorkoutRecord = { id: string; data: Workout };
const uid = 'up-next-target-test-user';
let planned: WorkoutRecord[] = [];
let history: WorkoutRecord[] = [];
let statusError: Error | null = null;
let historyError: Error | null = null;
let splitNames: string[] = [];
const repositoryCalls: [string, string][] = [];
const splitNameCalls: string[] = [];

mock.module(new URL('../data/workout-repository.web.ts', import.meta.url).pathname, () => ({
  workoutRepository: {
    getByStatus: async (requestedUid: string, status: string) => {
      repositoryCalls.push([requestedUid, status]);
      if (statusError) throw statusError;
      return planned;
    },
    getHistory: async (requestedUid: string) => {
      repositoryCalls.push([requestedUid, 'history']);
      if (historyError) throw historyError;
      return history;
    },
  },
}));

mock.module(new URL('./split-names.ts', import.meta.url).pathname, () => ({
  loadSplitNames: async (requestedUid: string) => {
    splitNameCalls.push(requestedUid);
    return splitNames;
  },
}));

const { resolveUpNextTarget } = await import('./up-next-target');

function workoutRecord(id: string, name: string, queueOrder?: number): WorkoutRecord {
  return {
    id,
    data: {
      id,
      userId: uid,
      name,
      queueOrder,
      performedExercises: [],
      schemaVersion: 2,
      status: 'planned',
    },
  };
}

function historyRecord(id: string, name: string, date: string): WorkoutRecord {
  return {
    id,
    data: {
      id,
      userId: uid,
      name,
      date,
      performedExercises: [],
      schemaVersion: 2,
      status: 'completed',
    },
  };
}

function reset(): void {
  planned = [];
  history = [];
  statusError = null;
  historyError = null;
  splitNames = [];
  repositoryCalls.length = 0;
  splitNameCalls.length = 0;
}

describe('resolveUpNextTarget', () => {
  beforeEach(reset);

  it('returns the first planned queue item without reading history', async () => {
    // The planned queue is the first branch, and queueOrder—not repository
    // arrival order—selects the destination. A planned target avoids
    // unnecessary history and split-name reads.
    planned = [
      workoutRecord('later', 'Later', 4),
      workoutRecord('first', 'First', 1),
      workoutRecord('implicit-last', 'Implicit'),
    ];

    assert.deepEqual(await resolveUpNextTarget(uid), { id: 'first' });
    assert.deepEqual(repositoryCalls, [[uid, 'planned']]);
    assert.deepEqual(splitNameCalls, []);
  });

  it('returns the predicted suggestion from capped history when there is no plan', async () => {
    splitNames = ['Push', 'Pull', 'Legs'];
    history = [
      ...Array.from({ length: 30 }, (_, index) =>
        historyRecord(`history-${index}`, 'Push', `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`),
      ),
      historyRecord('history-30', 'Pull', '2026-02-01T12:00:00.000Z'),
      historyRecord('history-31', 'Legs', '2026-02-02T12:00:00.000Z'),
    ];

    assert.deepEqual(await resolveUpNextTarget(uid), { suggestion: 'Pull' });
    assert.deepEqual(repositoryCalls, [[uid, 'planned'], [uid, 'history']]);
    assert.deepEqual(splitNameCalls, [uid]);
  });

  it('returns an empty target when the split has no prediction', async () => {
    assert.deepEqual(await resolveUpNextTarget(uid), {});
    assert.deepEqual(repositoryCalls, [[uid, 'planned'], [uid, 'history']]);
    assert.deepEqual(splitNameCalls, [uid]);
  });

  it('forwards an empty uid and preserves a planned repository failure', async () => {
    // There is no invented fallback for invalid repository input: failures
    // remain observable to callers, including an empty uid forwarded unchanged.
    statusError = new Error('planned read failed');

    await assert.rejects(resolveUpNextTarget(''), /planned read failed/);
    assert.deepEqual(repositoryCalls, [['', 'planned']]);
    assert.deepEqual(splitNameCalls, []);
  });

  it('preserves a history repository failure without loading split names', async () => {
    historyError = new Error('history read failed');
    splitNames = ['Push'];

    await assert.rejects(resolveUpNextTarget(uid), /history read failed/);
    assert.deepEqual(repositoryCalls, [[uid, 'planned'], [uid, 'history']]);
    assert.deepEqual(splitNameCalls, []);
  });
});
