import assert from 'node:assert/strict';
import { MUSCLES, type MuscleId } from '@/constants/muscles';
import type { CatalogExercise, PerformedExercise, PerformedSet, Workout } from '@/types/workout';
import { computeMuscleVolume, normalizeMuscleInsights } from './muscle-analysis';

const WINDOW_WEEKS = 30 / 7;

function catalogExercise(
  id: string,
  primaryMuscles: MuscleId[],
  secondaryMuscles: MuscleId[] = [],
  variations: CatalogExercise['variations'] = [],
): CatalogExercise {
  return {
    id,
    name: id,
    normalizedName: id,
    aliases: [],
    primaryMuscles,
    secondaryMuscles,
    movementPattern: 'push',
    equipment: [],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps'],
    variations,
    schemaVersion: 2,
    status: 'approved',
  };
}

function performedExercise(
  exerciseId: string,
  sets: PerformedSet[] | undefined,
  options: { variationId?: string | null; label?: string } = {},
): PerformedExercise {
  return {
    order: 0,
    exerciseId,
    exerciseRefPath: `exercises/${exerciseId}`,
    exerciseNameSnapshot: options.label ?? exerciseId,
    variationId: options.variationId === undefined ? null : options.variationId,
    variationNameSnapshot: options.variationId ? options.label ?? options.variationId : null,
    sets: sets as PerformedSet[],
  };
}

function workout(id: string, performedExercises: PerformedExercise[]): Workout {
  return {
    id,
    userId: 'user-1',
    name: 'Test workout',
    date: '2026-08-27T12:00:00.000Z',
    performedExercises,
    schemaVersion: 2,
  };
}

function stat(result: ReturnType<typeof computeMuscleVolume>, muscle: MuscleId) {
  const found = result.find((entry) => entry.muscle === muscle);
  assert.ok(found, `expected a stat row for ${muscle}`);
  return found;
}

function closeTo(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`);
}

function testExactCatalogJoinAndWeights(): void {
  const catalog = [
    catalogExercise('press', ['chest'], ['triceps'], [
      {
        id: 'incline',
        name: 'Incline Press',
        aliases: [],
        primaryMuscles: ['front delts'],
        secondaryMuscles: ['chest'],
      },
    ]),
    catalogExercise('empty', [], []),
  ];

  const result = computeMuscleVolume(
    [
      workout('parent', [performedExercise('press', [
        { setNumber: 1, reps: 8, rpe: 7 },
        { setNumber: 2, reps: 8, rpe: 9 },
      ])]),
      workout('matching-variation', [performedExercise('press', [
        { setNumber: 1, reps: 8, rpe: 5 },
      ], { variationId: 'incline', label: 'Incline Press' })]),
      workout('missing-variation', [performedExercise('press', [
        { setNumber: 1, reps: 8 },
        { setNumber: 2, reps: 8 },
        { setNumber: 3, reps: 8 },
      ], { variationId: 'does-not-exist' })]),
      workout('null-variation', [performedExercise('press', [
        { setNumber: 1, reps: 8 },
      ], { variationId: null })]),
      // The parent path is also used when legacy data has no variationId field.
      workout('undefined-variation', [performedExercise('press', [
        { setNumber: 1, reps: 8 },
      ], { variationId: undefined }) as PerformedExercise]),
      workout('unknown-exercise', [performedExercise('not-in-catalog', [
        { setNumber: 1, reps: 8 },
        { setNumber: 2, reps: 8 },
      ])]),
      workout('empty-muscles', [performedExercise('empty', [{ setNumber: 1, reps: 8 }])]),
      workout('empty-sets', [performedExercise('press', [])]),
      workout('undefined-sets', [performedExercise('press', undefined)]),
    ],
    catalog,
  );

  const chest = stat(result, 'chest');
  const triceps = stat(result, 'triceps');
  const frontDelts = stat(result, 'front delts');

  // Primary sets contribute 1.0 and secondary sets contribute 0.5. The
  // matching variation replaces the parent's muscles; a missing variation
  // falls back to the parent; null and omitted variation ids do too.
  closeTo(chest.weeklySets, 7.5 / WINDOW_WEEKS, 'primary/secondary weighted weekly chest sets');
  closeTo(triceps.weeklySets, 3.5 / WINDOW_WEEKS, 'parent secondary weekly triceps sets');
  closeTo(frontDelts.weeklySets, 1 / WINDOW_WEEKS, 'variation primary replaces parent muscles');

  // RPE is unweighted and copied in full to every muscle touched by an
  // exercise, including the secondary muscle.
  closeTo(chest.avgRpe ?? NaN, (7 + 9 + 5) / 3, 'chest averages only sets that recorded RPE');
  closeTo(triceps.avgRpe ?? NaN, (7 + 9) / 2, 'secondary muscle receives the full RPE sum/count');
  assert.equal(stat(result, 'soleus').avgRpe, null, 'untrained muscle has no average RPE');

  // Distinct workout ids, not performed-exercise count, determine sessions.
  closeTo(chest.weeklySessions, 5 / WINDOW_WEEKS, 'sessions count distinct workouts');
  closeTo(triceps.weeklySessions, 4 / WINDOW_WEEKS, 'secondary sessions count distinct workouts');

  assert.equal(result.length, MUSCLES.length, 'every canonical muscle has a row');
  assert.deepEqual(new Set(result.map((entry) => entry.muscle)), new Set(MUSCLES));
  assert.ok(result.filter((entry) => entry.weeklySets === 0).length > 0, 'untrained rows remain visible');
  assert.equal(stat(result, 'soleus').weeklySets, 0, 'untrained muscle is emitted with zero volume');
  assert.equal(stat(result, 'soleus').weeklySessions, 0, 'untrained muscle is emitted with zero sessions');
  assert.deepEqual(stat(result, 'soleus').topExercises, []);
}

function testTopExercisesAndUnnamedLabels(): void {
  const catalog = [
    catalogExercise('alpha', ['chest']),
    catalogExercise('bravo', ['chest']),
    catalogExercise('charlie', ['chest']),
    catalogExercise('delta', ['chest']),
    catalogExercise('unnamed', ['chest']),
  ];
  const sets = (count: number): PerformedSet[] =>
    Array.from({ length: count }, (_, index) => ({ setNumber: index + 1, reps: 8 }));

  const result = computeMuscleVolume(
    [
      workout('alpha', [performedExercise('alpha', sets(4), { label: 'Alpha' })]),
      workout('bravo', [performedExercise('bravo', sets(3), { label: 'Bravo' })]),
      workout('charlie', [performedExercise('charlie', sets(2), { label: 'Charlie' })]),
      workout('delta', [performedExercise('delta', sets(1), { label: 'Delta' })]),
      workout('unnamed', [performedExercise('unnamed', sets(1), { label: '' })]),
    ],
    catalog,
  );

  assert.deepEqual(stat(result, 'chest').topExercises, ['Alpha', 'Bravo', 'Charlie'], 'top 3 are descending contributors');
  assert.equal(stat(result, 'chest').topExercises.includes('Delta'), false, 'fourth contributor is capped out');

  // exerciseLabel(pe).trim() is intentionally allowed to be empty for old or
  // malformed snapshots; lock the current output rather than inventing a name.
  assert.deepEqual(stat(result, 'chest').topExercises, ['Alpha', 'Bravo', 'Charlie']);
  const unnamedOnly = computeMuscleVolume(
    [workout('unnamed-only', [performedExercise('unnamed', sets(1), { label: '' })])],
    catalog,
  );
  assert.deepEqual(stat(unnamedOnly, 'chest').topExercises, [''], 'unnamed exercise contributes an empty label');
}

function testInsightNormalization(): void {
  assert.deepEqual(
    normalizeMuscleInsights({
      overTrained: ['  Chest is high  ', 'ALL GOOD for now', '', '  Back is high  ', 'Arms are high', 'Legs are high'],
      underTrained: [' all good', '  Legs need work  ', '  ', 'Core needs work', 'Arms need work', 'Shoulders need work'],
    }),
    {
      overTrained: ['Chest is high', 'Back is high', 'Arms are high'],
      underTrained: ['Legs need work', 'Core needs work', 'Arms need work'],
    },
    'insights trim, drop empties/all-good, and cap each list at 3',
  );
  assert.deepEqual(
    normalizeMuscleInsights({ overTrained: undefined as unknown as string[], underTrained: undefined as unknown as string[] }),
    { overTrained: [], underTrained: [] },
    'legacy or absent insight lists normalize to empty arrays',
  );
}

testExactCatalogJoinAndWeights();
testTopExercisesAndUnnamedLabels();
testInsightNormalization();

console.log('muscle-analysis: all assertions passed');
