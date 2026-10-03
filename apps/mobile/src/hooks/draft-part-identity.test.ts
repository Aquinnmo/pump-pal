import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import { describe, it } from 'bun:test';
import { buildPerformedExercise, collapseSetsToDraft, normalizeDraftSets, setLabels, setParts } from '@/lib/workout-conversion';
import { makeDraftExerciseRow, makePerformedExercise } from '@/tests/factories';
import type { DraftExerciseRow, DraftPartTarget, DraftSet } from '@/types/workout';
import { useDraftExercises } from './use-draft-exercises';

const set = (reps: number): DraftSet => ({ reps, weight: String(reps), durationMinutes: 0, durationSeconds: 0 });
const row = (uid = 'exercise-a'): DraftExerciseRow => makeDraftExerciseRow({ uid, sets: [set(10), set(20), set(30), set(40)] });
const target = (exercise: DraftExerciseRow, index: number, stage = 0): DraftPartTarget => ({
  exerciseUid: exercise.uid,
  setUid: exercise.sets[index].uid!,
  partUid: setParts(exercise.sets[index])[stage].uid!,
});

function withDraft(rows: DraftExerciseRow[], run: (draft: { current: ReturnType<typeof useDraftExercises> }) => void) {
  const { result, unmount } = renderHook(() => useDraftExercises({ trackCompletion: true }));
  try {
    act(() => result.current.setExercises(rows));
    run(result);
  } finally {
    unmount();
  }
}

describe('draft part identity', () => {
  it('assigns IDs to legacy parts and keeps them through editing and cloning', () => {
    withDraft([makeDraftExerciseRow({ sets: [{ ...set(10), type: 'drop', subSets: [set(8), set(6)] }] })], (draft) => {
      const original = setParts(draft.current.exercises[0].sets[0]).map((part) => part.uid);
      assert.ok(original.every(Boolean), 'legacy draft parts need IDs before rendering');
      assert.equal(new Set(original).size, 3);
      act(() => draft.current.updateSet(0, 0, 'weight', '15', 1));
      assert.deepEqual(setParts(draft.current.exercises[0].sets[0]).map((part) => part.uid), original);
      act(() => draft.current.addSet(0));
      const ids = draft.current.exercises[0].sets.flatMap(setParts).map((part) => part.uid);
      assert.equal(new Set(ids).size, 6, 'cloning must give every copied part a fresh ID');
      assert.deepEqual(ids.slice(0, 3), original);
      assert.ok(draft.current.exercises[0].sets.flatMap(setParts).slice(3).every((part) => part.completed === false));
      act(() => draft.current.addSubSet(0, 1));
      assert.equal(new Set(draft.current.exercises[0].sets.flatMap(setParts).map((part) => part.uid)).size, 7);
    });
  });

  it('removes the intended set after earlier deletions and ignores repeat requests', () => {
    withDraft([row()], (draft) => {
      const first = target(draft.current.exercises[0], 0);
      const third = target(draft.current.exercises[0], 2);
      act(() => { draft.current.removePart(first); draft.current.removePart(third); draft.current.removePart(third); });
      const remaining = draft.current.exercises[0];
      assert.deepEqual(remaining.sets.map((part) => part.reps), [20, 40]);
      assert.deepEqual(setLabels(remaining.sets), ['1', '2']);
      assert.deepEqual(buildPerformedExercise(remaining, 0).sets.map((part) => part.setNumber), [1, 2]);
    });
  });

  it('finds targets after exercise reordering and ignores removed exercises', () => {
    withDraft([row(), row('exercise-b')], (draft) => {
      const a = target(draft.current.exercises[0], 1);
      const b = target(draft.current.exercises[1], 2);
      act(() => draft.current.setExercises((prev) => [prev[1], prev[0]]));
      act(() => draft.current.removePart(b));
      assert.deepEqual(draft.current.exercises[0].sets.map((part) => part.reps), [10, 20, 40]);
      act(() => draft.current.removeExercise(1));
      const before = draft.current.exercises;
      act(() => { draft.current.removePart(a); draft.current.togglePartComplete(a); });
      assert.equal(draft.current.exercises, before, 'stale targets are true no-ops');
    });
  });

  it('removes only the targeted drop despite shifting stages and protects the final set', () => {
    withDraft([makeDraftExerciseRow({ sets: [{ ...set(10), type: 'drop', subSets: [set(8), set(6)] }] })], (draft) => {
      const top = target(draft.current.exercises[0], 0);
      const first = target(draft.current.exercises[0], 0, 1);
      const second = target(draft.current.exercises[0], 0, 2);
      act(() => { draft.current.removePart(top); draft.current.removePart(first); draft.current.removePart(first); });
      assert.deepEqual(draft.current.exercises[0].sets[0].subSets?.map((part) => part.reps), [6]);
      act(() => draft.current.togglePartComplete(second));
      assert.equal(draft.current.exercises[0].sets[0].subSets?.[0].completed, true);
      act(() => draft.current.removePart(second));
      assert.equal(draft.current.exercises[0].sets.length, 1);
      assert.equal(draft.current.exercises[0].sets[0].type, undefined);
      assert.equal(draft.current.exercises[0].sets[0].subSets, undefined);
      act(() => draft.current.togglePartComplete(second));
      assert.equal(draft.current.exercises[0].sets[0].completed, undefined);
    });
  });

  it('keeps slot IDs during autofill normalization and omits them from saved data', () => {
    const normalized = normalizeDraftSets([{ ...set(10), uid: 'a' }, { ...set(10), uid: 'b' }, { ...set(30), uid: 'c' }]);
    assert.deepEqual(normalized.map((part) => part.uid), ['a', 'b', 'c']);
    assert.deepEqual(normalized.map((part) => part.reps), [10, 10, 10]);
    const restored = collapseSetsToDraft(makePerformedExercise({ sets: [
      { setNumber: 1, type: 'drop', reps: 10, weight: 10 },
      { setNumber: 1, type: 'drop', reps: 8, weight: 8 },
      { setNumber: 2, reps: 6, weight: 6 },
    ] }));
    assert.ok(restored.sets.flatMap(setParts).every((part) => part.uid));
    const saved = buildPerformedExercise(restored, 0);
    assert.equal(JSON.stringify(saved).includes('uid'), false);
    assert.deepEqual(saved.sets.map((part) => part.setNumber), [1, 1, 2]);
  });
});
