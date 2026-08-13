import assert from 'node:assert/strict';

import type { DraftExerciseRow, DraftSet } from '@/types/workout';
import {
  matchesExpectedCompletedSets,
  parseLiveUpdateNotificationAction,
} from '@/lib/workout-action';
import { applyWearAction } from '@/lib/wear-state';

const set = (completed = false): DraftSet => ({
  reps: 10,
  weight: '135',
  durationMinutes: 0,
  durationSeconds: 0,
  completed,
});
const row = (sets: DraftSet[]): DraftExerciseRow => ({
  uid: 'bench',
  exerciseId: 'bench',
  variationId: null,
  label: 'Bench Press',
  exerciseType: 'Sets of Reps',
  bodyweight: false,
  sets,
});

assert.deepEqual(parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1","expectedCompletedSets":0}'), {
  action: 'completeSet',
  workoutId: 'w1',
  expectedCompletedSets: 0,
});
assert.deepEqual(parseLiveUpdateNotificationAction('{"action":"uncompleteSet","workoutId":"w1","expectedCompletedSets":1}'), {
  action: 'uncompleteSet',
  workoutId: 'w1',
  expectedCompletedSets: 1,
});
assert.deepEqual(parseLiveUpdateNotificationAction('{"action":"finishWorkout","workoutId":"w1","expectedCompletedSets":2}'), {
  action: 'finishWorkout',
  workoutId: 'w1',
  expectedCompletedSets: 2,
});
assert.equal(parseLiveUpdateNotificationAction('{"action":"startWorkout"}'), null);
assert.equal(parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1"}'), null);
assert.equal(parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1","expectedCompletedSets":-1}'), null);
assert.equal(parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1","expectedCompletedSets":1.5}'), null);
assert.equal(parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":" "}'), null);
assert.equal(parseLiveUpdateNotificationAction('{"action":"unknown","workoutId":"w1","expectedCompletedSets":0}'), null);
assert.equal(parseLiveUpdateNotificationAction('not json'), null);

const action = parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1","expectedCompletedSets":0}')!;
const before = [row([set(), set()])];
assert.equal(matchesExpectedCompletedSets(before, action), true);
const afterOneTap = applyWearAction(before, action);
assert.equal(matchesExpectedCompletedSets(afterOneTap, action), false);

console.log('workout-action: ok');
