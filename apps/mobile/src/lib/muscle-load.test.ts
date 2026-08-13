import assert from 'node:assert/strict';
import { MUSCLES, type MuscleId } from '@/constants/muscles';
import type { CatalogExercise, PerformedSet, Workout } from '@/types/workout';
import {
  computeMuscleLoad,
  muscleLoadColor,
  muscleLoadPercentage,
  MUSCLE_LOAD_SATURATION_SCORE,
} from '@/lib/muscle-load';
import { muscleMapColor } from '@/lib/muscle-map-scale';

const NOW = new Date('2026-08-02T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function catalogExercise(
  id: string,
  primary: MuscleId[],
  secondary: MuscleId[] = [],
  variations: CatalogExercise['variations'] = [],
  status: CatalogExercise['status'] = 'approved'
): CatalogExercise {
  return {
    id,
    name: id,
    normalizedName: id,
    aliases: [],
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    movementPattern: '',
    equipment: [],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'mixed',
    trackingModes: ['reps'],
    variations,
    schemaVersion: 2,
    status,
  };
}

function workout(
  id: string,
  ageDays: number,
  exerciseId: string,
  sets: PerformedSet[],
  variationId: string | null = null,
  label = exerciseId
): Workout {
  return {
    id,
    userId: 'user',
    name: 'Test',
    date: new Date(NOW - ageDays * DAY),
    performedExercises: [
      {
        order: 0,
        exerciseId,
        exerciseRefPath: `exercises/${exerciseId}`,
        exerciseNameSnapshot: label,
        variationId,
        variationNameSnapshot: variationId,
        sets,
      },
    ],
    schemaVersion: 2,
  };
}

function score(result: ReturnType<typeof computeMuscleLoad>, muscle: MuscleId): number {
  return result.muscles.find((entry) => entry.muscle === muscle)?.score ?? NaN;
}

function closeTo(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: expected ${expected}, got ${actual}`);
}

function testExactMappingAndCoverage(): void {
  const catalog = [
    catalogExercise('press', ['chest'], ['triceps'], [
      {
        id: 'incline',
        name: 'Incline',
        aliases: [],
        primaryMuscles: ['front delts'],
        secondaryMuscles: ['chest'],
      },
    ]),
    catalogExercise('pending', ['biceps'], [], [], 'pending_review'),
  ];
  const workouts = [
    workout('parent', 0, 'press', [{ setNumber: 1, reps: 10 }]),
    workout('variation', 0, 'press', [{ setNumber: 1, reps: 10 }], 'incline'),
    workout('missing-variation', 0, 'press', [{ setNumber: 1, reps: 10 }], 'unknown'),
    workout('unknown', 0, 'unknown', [{ setNumber: 1, reps: 10 }]),
    workout('pending', 0, 'pending', [{ setNumber: 1, reps: 10 }]),
  ];
  const result = computeMuscleLoad(workouts, catalog, NOW);

  closeTo(score(result, 'chest'), 1.5, 'parent and variation allocate independently');
  closeTo(score(result, 'triceps'), 0.5, 'parent secondary allocation');
  closeTo(score(result, 'front delts'), 1, 'exact variation primary allocation');
  assert.equal(score(result, 'biceps'), 0, 'pending mappings are never attributed');
  assert.deepEqual(result.coverage, {
    recentExercises: 5,
    recentSets: 5,
    matchedExercises: 2,
    matchedSets: 2,
    unmatchedExercises: 3,
    unmatchedSets: 3,
  });
}

function testMetricsAndHistoricalNormalization(): void {
  const catalog = [catalogExercise('metrics', ['chest'])];
  const historical = workout(
    'historical',
    20,
    'metrics',
    [
      { setNumber: 1, reps: 10, weight: 100 },
      { setNumber: 2, reps: 20, bodyweight: true },
      { setNumber: 3, durationSeconds: 60 },
      { setNumber: 4, distance: 10 },
      { setNumber: 5, calories: 200 },
    ]
  );
  const recent = workout(
    'recent',
    0,
    'metrics',
    [
      { setNumber: 1, reps: 10, weight: 50 },
      { setNumber: 2, reps: 10, bodyweight: true },
      { setNumber: 3, durationSeconds: 30 },
      { setNumber: 4, distance: 5 },
      { setNumber: 5, calories: 100 },
      { setNumber: 6, reps: 0, weight: 100 },
    ]
  );
  const result = computeMuscleLoad([historical, recent], catalog, NOW);
  closeTo(score(result, 'chest'), 2.5, 'each metric is isolated and normalized to its historical best');
}

function testDecayAndBoundaries(): void {
  const catalog = [catalogExercise('row', ['quads'])];
  const workouts = [
    workout('now', 0, 'row', [{ setNumber: 1, reps: 10 }]),
    workout('two-days', 2, 'row', [{ setNumber: 1, reps: 10 }]),
    workout('boundary', 7, 'row', [{ setNumber: 1, reps: 10 }]),
    workout('too-old', 7.0001, 'row', [{ setNumber: 1, reps: 10 }]),
    workout('future', -0.5, 'row', [{ setNumber: 1, reps: 100 }]),
  ];
  const result = computeMuscleLoad(workouts, catalog, NOW);
  closeTo(score(result, 'quads'), 1 + 0.5 + 2 ** -3.5, '2-day half-life and rolling boundary');
  assert.equal(result.muscles.find((entry) => entry.muscle === 'quads')?.lastWorkedAt, NOW);
}

function testStableRowsAndContributorOrder(): void {
  const catalog = [
    catalogExercise('zeta', ['lats']),
    catalogExercise('alpha', ['lats']),
  ];
  const result = computeMuscleLoad(
    [
      workout('zeta', 0, 'zeta', [{ setNumber: 1, reps: 10 }], null, 'Zeta Row'),
      workout('alpha', 0, 'alpha', [{ setNumber: 1, reps: 10 }], null, 'Alpha Row'),
    ],
    catalog,
    NOW
  );
  assert.deepEqual(result.muscles.map((entry) => entry.muscle), [...MUSCLES]);
  assert.equal(result.muscles.length, 27);
  assert.deepEqual(
    result.muscles.find((entry) => entry.muscle === 'lats')?.contributors.map((entry) => entry.label),
    ['Alpha Row', 'Zeta Row']
  );
  assert.equal(result.muscles.find((entry) => entry.muscle === 'soleus')?.lastWorkedAt, null);
}

function testCatalogAvailabilityAndColor(): void {
  const unavailable = computeMuscleLoad(
    [workout('unknown', 0, 'unknown', [{ setNumber: 1, reps: 10 }])],
    [],
    NOW
  );
  assert.equal(unavailable.catalogAvailable, false);
  assert.equal(unavailable.muscles.every((entry) => entry.score === 0), true);
  assert.equal(muscleLoadColor(0), '#60a5fa');
  assert.equal(muscleLoadColor(MUSCLE_LOAD_SATURATION_SCORE), '#f59e0b');
  assert.equal(muscleLoadColor(100), '#f59e0b');
  assert.equal(muscleLoadColor(-1), '#60a5fa');
}

function testSharedPalette(): void {
  assert.equal(muscleMapColor(0), '#60a5fa');
  assert.equal(muscleMapColor(25), '#7497c1');
  assert.equal(muscleMapColor(50), '#888888');
  assert.equal(muscleMapColor(75), '#bf934a');
  assert.equal(muscleMapColor(100), '#f59e0b');
}

function testPercentageBoundaries(): void {
  assert.equal(muscleLoadPercentage(-1), 0);
  assert.equal(muscleLoadPercentage(0), 0);
  assert.equal(muscleLoadPercentage(4), 50);
  assert.equal(muscleLoadPercentage(MUSCLE_LOAD_SATURATION_SCORE), 100);
  assert.equal(muscleLoadPercentage(100), 100);
}

testExactMappingAndCoverage();
testMetricsAndHistoricalNormalization();
testDecayAndBoundaries();
testStableRowsAndContributorOrder();
testCatalogAvailabilityAndColor();
testPercentageBoundaries();
testSharedPalette();

console.log('muscle-load tests passed');
