import assert from 'node:assert/strict';
import type { DraftExerciseRow } from '@/types/workout';
import { applyWearAction } from '@/lib/wear-state';
import { endSession, getSession, startSession, subscribe, updateSession } from '@/lib/active-workout-session';

function row(): DraftExerciseRow {
  return {
    uid: 'row-1',
    exerciseId: 'ex-1',
    variationId: null,
    label: 'Bench Press',
    exerciseType: 'Sets of Reps',
    bodyweight: false,
    sets: [{ reps: 5, weight: '135', durationMinutes: 0, durationSeconds: 30, completed: false }],
  };
}

function main() {
  assert.equal(getSession(), null, 'no session before start');

  const started = startSession({ uid: 'u1', planId: null, name: 'Push Day', rows: [row()], cameFromPlan: false });
  assert.equal(getSession(), started);
  assert.equal(getSession()?.rows[0].sets[0].completed, false);

  let notifications = 0;
  const unsubscribe = subscribe(() => notifications++);

  const next = applyWearAction(started.rows, { action: 'completeSet', workoutId: started.id });
  updateSession(next);

  assert.equal(getSession()?.rows[0].sets[0].completed, true, 'completeSet action landed in the session');
  assert.equal(notifications, 1, 'subscriber was notified of the update');

  unsubscribe();

  endSession();
  assert.equal(getSession(), null, 'session cleared after endSession');

  // A further mutation after the session ended is a no-op — nothing to resurrect.
  updateSession([row()]);
  assert.equal(getSession(), null, 'updateSession after endSession stays a no-op');

  console.log('src/lib/active-workout-session.test.ts: all assertions passed');
}

main();
