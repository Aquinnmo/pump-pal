import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DraftExerciseRow } from '@/types/workout';
import { endSession, getSession, startSession } from '@/lib/active-workout-session';
import { handleWorkoutAction } from '@/lib/wear-action-task';

function row(): DraftExerciseRow {
  return {
    uid: 'row-1',
    exerciseId: 'ex-1',
    variationId: null,
    label: 'Bench Press',
    exerciseType: 'Sets of Reps',
    bodyweight: false,
    sets: [
      { reps: 5, weight: '135', durationMinutes: 0, durationSeconds: 30, completed: false },
      { reps: 5, weight: '135', durationMinutes: 0, durationSeconds: 30, completed: false },
    ],
  };
}

async function main() {
  const implementation = readFileSync(new URL('./wear-action-task.ts', import.meta.url), 'utf8');
  // Keep this boundary executable without introducing a production DI seam. Strip comments
  // first because the handler documents the persistence it deliberately does not own.
  const executableImplementation = implementation
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    executableImplementation,
    /from ['"][^'"]*(?:\/data\/|workout-repository|outbox|sqlite|firestore|api-client|sync-trigger|sync-engine)[^'"]*['"]|\b(?:workoutRepository|triggerSyncAfterWrite|finishWorkout|Firestore|firestore|SQLite|sqlite|outbox)\b/i,
    'store-only handler must not import or call workout persistence/sync dependencies',
  );

  endSession();
  const started = startSession({
    uid: 'u1',
    planId: null,
    name: 'Push Day',
    rows: [row()],
    cameFromPlan: false,
  });

  await handleWorkoutAction({
    action: 'completeSet',
    workoutId: started.id,
    expectedCompletedSets: 0,
  });
  const afterComplete = getSession();
  assert(afterComplete, 'completeSet keeps the active session alive');
  const completedRows = afterComplete.rows.map((draftRow) => ({
    ...draftRow,
    sets: draftRow.sets.map((set) => ({ ...set })),
  }));
  assert.equal(afterComplete.rows[0].sets[0].completed, true);
  assert.equal(afterComplete.rows[0].sets[1].completed, false);

  // The optimistic island action is stale now; it must not apply a second mutation.
  await handleWorkoutAction({
    action: 'completeSet',
    workoutId: started.id,
    expectedCompletedSets: 0,
  });
  assert.equal(getSession(), afterComplete, 'stale completeSet leaves the session unchanged');
  assert.deepEqual(getSession()?.rows, completedRows, 'stale completeSet cannot mutate rows in place');

  await handleWorkoutAction({
    action: 'uncompleteSet',
    workoutId: 'different-session',
    expectedCompletedSets: 1,
  });
  assert.equal(getSession(), afterComplete, 'mismatched workoutId leaves the session unchanged');
  assert.deepEqual(getSession()?.rows, completedRows, 'mismatched workoutId cannot mutate rows in place');

  await handleWorkoutAction({
    action: 'uncompleteSet',
    workoutId: started.id,
    expectedCompletedSets: 1,
  });
  const afterUndo = getSession();
  assert(afterUndo, 'uncompleteSet keeps the active session alive');
  assert.equal(afterUndo.rows[0].sets[0].completed, false);
  const undoneRows = afterUndo.rows.map((draftRow) => ({
    ...draftRow,
    sets: draftRow.sets.map((set) => ({ ...set })),
  }));

  // Persistence belongs to active-workout.tsx's explicit Finish flow. The store-only
  // action handler must not finish, clear, or otherwise mutate the in-memory session.
  await handleWorkoutAction({
    action: 'finishWorkout',
    workoutId: started.id,
    expectedCompletedSets: 0,
  });
  assert.equal(getSession(), afterUndo, 'finishWorkout is a no-op in the store-only handler');
  assert.deepEqual(getSession()?.rows, undoneRows, 'finishWorkout cannot mutate rows in place');

  endSession();
  console.log('src/lib/wear-action-task.test.ts: all assertions passed');
}

main();
