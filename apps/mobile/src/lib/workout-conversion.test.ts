import assert from 'node:assert/strict';
import type { DraftSet, DraftSubSet, Workout } from '@/types/workout';
import { SET_TYPES } from '@/constants/set-types';
import {
  buildPerformedExercise,
  cascadeSetField,
  collapseSetsToDraft,
  groupSupersets,
  inSuperset,
  lastWorkoutExercises,
  linkedToNext,
  nextSubSet,
  normalizeDraftSets,
  recentExercisesForDay,
  setClusters,
  setLabels,
  setParts,
  shareExerciseLines,
  stageLabel,
  stageOf,
  summarizePerformedExercise,
  summarizePerformedExerciseSetGroups,
  toDateObj,
  withStage,
} from '@/lib/workout-conversion';

const ISO = '2026-08-05T12:30:00.000Z';
const MILLIS = new Date(ISO).getTime();

assert.equal(toDateObj(new Date(ISO))?.getTime(), MILLIS);
assert.equal(toDateObj(ISO)?.getTime(), MILLIS);
assert.equal(toDateObj(MILLIS)?.getTime(), MILLIS);
assert.equal(toDateObj({ seconds: MILLIS / 1000, nanoseconds: 0 })?.getTime(), MILLIS);
assert.equal(toDateObj({ toDate: () => new Date(ISO) })?.getTime(), MILLIS);

assert.equal(toDateObj(undefined), null);
assert.equal(toDateObj(null), null);
assert.equal(toDateObj('not-a-date'), null);
assert.equal(toDateObj({ seconds: Number.NaN, nanoseconds: 0 }), null);
assert.equal(toDateObj({ toDate: () => { throw new Error('bad timestamp'); } }), null);

const baseWorkout: Workout = {
  id: 'valid',
  userId: 'user',
  name: 'Push',
  date: ISO,
  status: 'completed',
  performedExercises: [{
    order: 0,
    exerciseId: 'bench-press',
    exerciseRefPath: 'exercises/bench-press',
    exerciseNameSnapshot: 'Bench Press',
    variationId: null,
    variationNameSnapshot: null,
    sets: [],
  }],
  schemaVersion: 2,
};

const invalidWorkout: Workout = {
  ...baseWorkout,
  id: 'invalid',
  date: undefined,
};

assert.deepEqual(
  recentExercisesForDay([invalidWorkout, baseWorkout], 'Push', new Date('2026-08-06T00:00:00.000Z')),
  [{ exerciseId: 'bench-press', variationId: null, label: 'Bench Press' }],
);

// normalizeDraftSets: mode wins; no repeats → median; tied modes → median of the
// tied sets; even counts take the upper (heavier) middle.
const set = (reps: number, weight: string, completed?: boolean): DraftSet =>
  ({ reps, weight, durationMinutes: 0, durationSeconds: 0, completed });
const pairs = (sets: DraftSet[]) => sets.map((s) => `${s.reps}x${s.weight}`);

assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(10, '100'), set(8, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(12, '95'), set(8, '105'), set(10, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(8, '110')])), ['8x110', '8x110']);
assert.deepEqual(
  pairs(normalizeDraftSets([set(10, '100'), set(10, '100'), set(8, '110'), set(8, '110')])),
  ['8x110', '8x110', '8x110', '8x110'],
);
assert.deepEqual(
  pairs(normalizeDraftSets([set(6, '120'), set(6, '120'), set(10, '100'), set(10, '100'), set(8, '110'), set(8, '110')])),
  ['8x110', '8x110', '8x110', '8x110', '8x110', '8x110'],
);
// Same weight: reps break the order. "100" and "100.0" are the same set.
assert.deepEqual(pairs(normalizeDraftSets([set(12, '100'), set(8, '100.0'), set(10, '100')])), ['10x100', '10x100', '10x100']);
assert.deepEqual(pairs(normalizeDraftSets([set(10, '100'), set(8, '100.0'), set(8, '100')])), ['8x100.0', '8x100.0', '8x100.0']);
// One set is left alone; each slot keeps its own completed flag.
assert.deepEqual(pairs(normalizeDraftSets([set(7, '50')])), ['7x50']);
assert.deepEqual(
  normalizeDraftSets([set(10, '100', true), set(10, '100', false), set(9, '100')]).map((s) => s.completed),
  [true, false, undefined],
);
// Duration sets normalize on their duration.
const hold = (seconds: number): DraftSet => ({ reps: 0, weight: '', durationMinutes: Math.floor(seconds / 60), durationSeconds: seconds % 60 });
assert.deepEqual(
  normalizeDraftSets([hold(60), hold(45), hold(30)]).map((s) => [s.durationMinutes, s.durationSeconds]),
  [[0, 45], [0, 45], [0, 45]],
);

// collapseSetsToDraft only normalizes when asked.
const uneven = {
  ...baseWorkout.performedExercises![0]!,
  sets: [
    { setNumber: 1, reps: 10, weight: 100 },
    { setNumber: 2, reps: 10, weight: 100 },
    { setNumber: 3, reps: 6, weight: 100 },
  ],
};
assert.deepEqual(pairs(collapseSetsToDraft(uneven).sets), ['10x100', '10x100', '6x100']);
assert.deepEqual(pairs(collapseSetsToDraft(uneven, true).sets), ['10x100', '10x100', '10x100']);

// Supersets are positional: only adjacent rows sharing an id link.
const ids = [{ supersetId: 'a' }, { supersetId: 'a' }, {}, { supersetId: 'a' }, { supersetId: 'b' }];
assert.deepEqual(ids.map((_, i) => linkedToNext(ids, i)), [true, false, false, false, false]);
assert.deepEqual(ids.map((_, i) => inSuperset(ids, i)), [true, true, false, false, false]);
assert.deepEqual(groupSupersets(ids).map((g) => g.length), [2, 1, 1, 1]);

// supersetId survives the draft round trip, and stays absent when unset.
assert.equal(buildPerformedExercise(collapseSetsToDraft({ ...uneven, supersetId: 'a' }), 0).supersetId, 'a');
assert.equal('supersetId' in buildPerformedExercise(collapseSetsToDraft(uneven), 0), false);

// Set types round-trip untouched, unknown ids included, so a build that predates a
// type never strips it on re-save.
const typed = { ...uneven, sets: [{ setNumber: 1, reps: 8, weight: 185 }, { setNumber: 2, reps: 6, weight: 135, type: 'future-type' }] };
assert.deepEqual(buildPerformedExercise(collapseSetsToDraft(typed), 0).sets.map((s) => s.type), [undefined, 'future-type']);
assert.equal('type' in buildPerformedExercise(collapseSetsToDraft(typed), 0).sets[0]!, false);

// Drop sets: one set with drops inside it, stored as parts sharing a setNumber.
const part = (reps: number, weight: string): DraftSubSet => ({ reps, weight, durationMinutes: 0, durationSeconds: 0 });
const dropSet = (weight: string, drops: string[]): DraftSet => ({ ...part(8, weight), type: 'drop', subSets: drops.map((w) => part(6, w)) });
const draftRow = (sets: DraftSet[]) => ({ ...collapseSetsToDraft(uneven), sets });

// A drop set can be the first set; its parts all carry set number 1 and the type.
const stored = buildPerformedExercise(draftRow([dropSet('185', ['150', '120']), part(8, '185')]), 0).sets;
assert.deepEqual(stored.map((s) => [s.setNumber, s.weight, s.type]), [
  [1, 185, 'drop'],
  [1, 150, 'drop'],
  [1, 120, 'drop'],
  [2, 185, undefined],
]);
// ...and collapses back into the same nested shape.
const restored = collapseSetsToDraft({ ...uneven, sets: stored }).sets;
assert.deepEqual(restored.map((s) => [s.type, s.weight, s.subSets?.map((d) => d.weight)]), [
  ['drop', '185', ['150', '120']],
  [undefined, '185', undefined],
]);
// Legacy rows with a repeated set number never nest unless they carry a sub-set type.
assert.deepEqual(setClusters([{ setNumber: 1 }, { setNumber: 1 }, { setNumber: 2, type: 'drop' }, { setNumber: 2, type: 'drop' }]), [[0], [1], [2, 3]]);
assert.deepEqual(setLabels([{}, { type: 'drop' }, { type: 'future-type' }]), ['1', '2', '3']);

// Stages: 0 is the set, k is subSets[k - 1].
const oneDrop = dropSet('185', ['150']);
assert.equal(stageOf(oneDrop, 1).weight, '150');
assert.equal(withStage(oneDrop, 1, { completed: true }).subSets![0].completed, true);
assert.equal(stageLabel(oneDrop, 1), 'Drop 2 of 2');
assert.equal(stageLabel(part(8, '185'), 0), null);

// A new drop is the previous part cut by the type's factor, rounded to 5 lbs.
const drop = SET_TYPES.find((t) => t.id === 'drop')!;
assert.equal(nextSubSet(drop, part(8, '185')).weight, '150');
assert.equal(nextSubSet(drop, part(8, '')).weight, '');

// Cascade: tops share one lane across every set; drop k shares one across drop sets;
// changes also flow down a set's own drops, and every change ripples on from there.
const ss = (reps: number, weight: string, over: Partial<DraftSubSet> = {}): DraftSet => ({ ...part(reps, weight), ...over });
const ds = (top: [number, string], ...drops: [number, string][]): DraftSet => ({
  ...part(...top),
  type: 'drop',
  subSets: drops.map(([r, w]) => part(r, w)),
});
const view = (sets: DraftSet[]) => sets.map((set) => setParts(set).map((p) => `${p.reps}x${p.weight}`).join(' / '));

// Top weight of a drop set reaches later tops, simple or drop; drops at 150 stay.
assert.deepEqual(view(cascadeSetField([ds([8, '185'], [6, '150']), ss(8, '185'), ds([8, '185'], [6, '150'])], 0, 'weight', '190')), [
  '8x190 / 6x150',
  '8x190',
  '8x190 / 6x150',
]);
// Top reps flow down into its own drops that held them, and on to later sets.
assert.deepEqual(view(cascadeSetField([ds([8, '185'], [8, '150']), ss(8, '185')], 0, 'reps', 10)), ['10x185 / 10x150', '10x185']);
// A simple set's edit reaches a later drop set's top, then flows down its drops.
assert.deepEqual(view(cascadeSetField([ss(8, '185'), ds([8, '185'], [8, '150'])], 0, 'reps', 10)), ['10x185', '10x185 / 10x150']);
// Drop 2 flows down its own set and to drop 2 of later drop sets — never to simple
// sets — and the knock-on drop 3 change ripples to drop 3 of later drop sets too.
assert.deepEqual(
  view(cascadeSetField([ds([8, '185'], [6, '150'], [6, '150']), ss(8, '150'), ds([8, '185'], [6, '150'], [6, '150'])], 0, 'weight', '145', 1)),
  ['8x185 / 6x145 / 6x145', '8x150', '8x185 / 6x145 / 6x145']
);
// A drop set without a drop 3 is skipped, not a stopper.
assert.deepEqual(
  view(cascadeSetField([ds([8, '185'], [6, '150'], [6, '120']), ds([8, '185'], [6, '150']), ds([8, '185'], [6, '150'], [6, '120'])], 0, 'weight', '115', 2)),
  ['8x185 / 6x150 / 6x115', '8x185 / 6x150', '8x185 / 6x150 / 6x115']
);
// A set the user made different stops the top lane; a different drop stops only that drop's lane.
assert.deepEqual(view(cascadeSetField([ss(8, '185'), ss(8, '175'), ss(8, '185')], 0, 'weight', '190')), ['8x190', '8x175', '8x185']);
assert.deepEqual(
  view(cascadeSetField([ds([8, '185'], [6, '150']), ds([8, '185'], [6, '140']), ds([8, '185'], [6, '150'])], 0, 'weight', '145', 1)),
  ['8x185 / 6x145', '8x185 / 6x140', '8x185 / 6x150']
);
// Completed parts are skipped, not stoppers — sets and drops alike.
assert.deepEqual(view(cascadeSetField([ss(8, '185'), ss(8, '185', { completed: true }), ss(8, '185')], 0, 'weight', '190')), ['8x190', '8x185', '8x190']);
// Top reps 6 → 8 with drop 2 already done: drop 2 is left as lifted, drop 3 still follows.
const doneDrop = ds([6, '185'], [6, '150'], [6, '150']);
doneDrop.subSets![0].completed = true;
assert.deepEqual(view(cascadeSetField([doneDrop], 0, 'reps', 8)), ['8x185 / 6x150 / 8x150']);
// Normalizing would erase the drop structure, so typed sets are left as they are.
const withDrop = [part(8, '185'), dropSet('185', ['150']), part(8, '175')];
assert.equal(normalizeDraftSets(withDrop), withDrop);

const dropped = {
  ...uneven,
  sets: [
    { setNumber: 1, reps: 8, weight: 185, type: 'drop' },
    { setNumber: 1, reps: 6, weight: 135, type: 'drop' },
    { setNumber: 2, reps: 8, weight: 185, type: 'drop' },
    { setNumber: 2, reps: 6, weight: 135, type: 'drop' },
  ],
};
assert.deepEqual(summarizePerformedExerciseSetGroups(dropped), ['2 x 8 reps @ 185 lbs → 6 reps @ 135 lbs']);
assert.equal(summarizePerformedExercise(dropped), '2 x 8 reps @ 185 lbs → 6 reps @ 135 lbs');
// Untyped grouping is unchanged.
assert.deepEqual(summarizePerformedExerciseSetGroups(uneven), ['2 x 10 reps @ 100 lbs', '6 reps @ 100 lbs']);

// Share text nests a superset's exercises under one bullet.
const named = (name: string, supersetId?: string) => ({
  ...uneven,
  exerciseNameSnapshot: name,
  variationNameSnapshot: null,
  sets: [{ setNumber: 1, reps: 10, weight: 100 }],
  ...(supersetId ? { supersetId } : {}),
});
assert.equal(
  shareExerciseLines([named('Bench', 's'), named('Row', 's'), named('Curl')]),
  [
    '  • Superset',
    '      – Bench — 1 × 10 reps @ 100 lbs',
    '      – Row — 1 × 10 reps @ 100 lbs',
    '  • Curl — 1 × 10 reps @ 100 lbs',
  ].join('\n')
);

// lastWorkoutExercises: same-name match wins over a newer workout; else the latest.
const pull = { ...baseWorkout, id: 'pull', name: 'Pull', performedExercises: [] };
assert.equal(lastWorkoutExercises([pull, baseWorkout], 'Push'), baseWorkout.performedExercises);
assert.equal(lastWorkoutExercises([pull, baseWorkout], 'Legs'), pull.performedExercises);
assert.equal(lastWorkoutExercises([pull, baseWorkout], ''), pull.performedExercises);
assert.deepEqual(lastWorkoutExercises([], 'Push'), []);

console.log('workout-conversion tests passed');
