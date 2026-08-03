import assert from 'node:assert/strict';
import { MUSCLES, type MuscleId } from '@/constants/muscles';
import type { CatalogExercise, PerformedExercise, PerformedSet, Workout } from '@/types/workout';
import {
  computeMuscleDevelopment,
  developmentGrade,
  setPerformance,
  topDevelopmentContributors,
  type MuscleDevelopmentContributor,
} from '@/utils/muscle-development';

const NOW = new Date('2026-08-02T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function catalogExercise(
  id: string,
  primary: MuscleId[],
  secondary: MuscleId[] = [],
  variations: CatalogExercise['variations'] = [],
  status: CatalogExercise['status'] = 'approved',
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

function performed(exerciseId: string, sets: PerformedSet[], variationId: string | null = null, label = exerciseId): PerformedExercise {
  return {
    order: 0,
    exerciseId,
    exerciseRefPath: `exercises/${exerciseId}`,
    exerciseNameSnapshot: label,
    variationId,
    variationNameSnapshot: variationId,
    sets,
  };
}

function workout(id: string, ageDays: number, exercises: PerformedExercise[]): Workout {
  return {
    id,
    userId: 'user',
    name: 'Test',
    date: new Date(NOW - ageDays * DAY),
    performedExercises: exercises,
    schemaVersion: 2,
  };
}

function stat(result: ReturnType<typeof computeMuscleDevelopment>, muscle: MuscleId) {
  return result.muscles.find((entry) => entry.muscle === muscle)!;
}

function closeTo(actual: number | null, expected: number, message: string): void {
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

function testPerformanceModes(): void {
  assert.deepEqual(setPerformance({ setNumber: 1, reps: 10, weight: 100 }), { metric: 'estimated_1rm', value: 100 * (1 + 10 / 30) });
  assert.deepEqual(setPerformance({ setNumber: 1, reps: 20, bodyweight: true }), { metric: 'reps', value: 20 });
  assert.deepEqual(setPerformance({ setNumber: 1, durationSeconds: 60 }), { metric: 'duration', value: 60 });
  assert.deepEqual(setPerformance({ setNumber: 1, distance: 100 }), { metric: 'distance', value: 100 });
  assert.deepEqual(setPerformance({ setNumber: 1, calories: 200 }), { metric: 'calories', value: 200 });
  assert.equal(setPerformance({ setNumber: 1, reps: 0, weight: 100 }), null);
}

function testWindowsAndExactMappings(): void {
  const catalog = [
    catalogExercise('press', ['chest'], [], [{ id: 'incline', name: 'Incline', aliases: [], primaryMuscles: ['front delts'], secondaryMuscles: [] }]),
    catalogExercise('pending', ['biceps'], [], [], 'pending_review'),
  ];
  const result = computeMuscleDevelopment([
    workout('previous-boundary', 180, [performed('press', [{ setNumber: 1, reps: 10 }])]),
    workout('recent-boundary', 90, [performed('press', [{ setNumber: 1, reps: 20 }])]),
    workout('excluded-old', 180.01, [performed('press', [{ setNumber: 1, reps: 100 }])]),
    workout('excluded-future', -1, [performed('press', [{ setNumber: 1, reps: 100 }])]),
    workout('unknown-variation', 10, [performed('press', [{ setNumber: 1, reps: 20 }], 'unknown')]),
    workout('pending', 10, [performed('pending', [{ setNumber: 1, reps: 20 }])]),
  ], catalog, NOW);

  closeTo(stat(result, 'chest').change, 100, '90-day boundaries compare without double counting');
  assert.equal(stat(result, 'front delts').score, null, 'variation never falls back to its parent mapping');
  assert.equal(stat(result, 'biceps').score, null, 'pending catalog mappings are excluded');
  assert.equal(result.coverage.unmatchedExercises, 2, 'unknown and pending recent entries are covered honestly');
}

function testGeometricAttributionAndRelativeScores(): void {
  const catalog = [
    catalogExercise('up', ['chest'], ['triceps']),
    catalogExercise('down', ['chest']),
    catalogExercise('regress', ['quads']),
  ];
  const result = computeMuscleDevelopment([
    workout('previous', 100, [
      performed('up', [{ setNumber: 1, reps: 10 }], null, 'Up'),
      performed('down', [{ setNumber: 1, reps: 20 }], null, 'Down'),
      performed('regress', [{ setNumber: 1, reps: 20 }]),
    ]),
    workout('recent', 10, [
      performed('up', [{ setNumber: 1, reps: 20 }], null, 'Up'),
      performed('down', [{ setNumber: 1, reps: 10 }], null, 'Down'),
      performed('regress', [{ setNumber: 1, reps: 10 }]),
    ]),
  ], catalog, NOW);

  closeTo(stat(result, 'chest').change, 0, 'equal weighted positive and negative ratios have geometric mean one');
  assert.equal(stat(result, 'chest').score, 50, 'zero change anchors at 50');
  closeTo(stat(result, 'triceps').change, 100, 'secondary muscles receive the same signal at half aggregation weight');
  assert.equal(stat(result, 'triceps').score, 100, 'largest positive change maps to 100');
  assert.equal(stat(result, 'quads').score, 0, 'largest regression maps to 0');
  assert.deepEqual(stat(result, 'chest').contributors.map((entry) => entry.label), ['Up', 'Down'], 'contributors sort by absolute effect then label');
}

function testAllPositiveAndAllNegativeScaling(): void {
  const catalog = [catalogExercise('small', ['chest']), catalogExercise('large', ['lats'])];
  const positive = computeMuscleDevelopment([
    workout('previous', 100, [performed('small', [{ setNumber: 1, reps: 10 }]), performed('large', [{ setNumber: 1, reps: 10 }])]),
    workout('recent', 10, [performed('small', [{ setNumber: 1, reps: 15 }]), performed('large', [{ setNumber: 1, reps: 20 }])]),
  ], catalog, NOW);
  assert.equal(stat(positive, 'lats').score, 100);
  assert.equal(stat(positive, 'chest').score, 75);

  const negative = computeMuscleDevelopment([
    workout('previous', 100, [performed('small', [{ setNumber: 1, reps: 20 }]), performed('large', [{ setNumber: 1, reps: 20 }])]),
    workout('recent', 10, [performed('small', [{ setNumber: 1, reps: 15 }]), performed('large', [{ setNumber: 1, reps: 10 }])]),
  ], catalog, NOW);
  assert.equal(stat(negative, 'lats').score, 0);
  assert.equal(stat(negative, 'chest').score, 25);
}

function testNullHistoryAndMixedMetrics(): void {
  const catalog = [catalogExercise('mixed', ['chest'])];
  const result = computeMuscleDevelopment([
    workout('previous', 100, [performed('mixed', [
      { setNumber: 1, reps: 10, weight: 100 },
      { setNumber: 2, reps: 10, bodyweight: true },
      { setNumber: 3, durationSeconds: 60 },
      { setNumber: 4, distance: 10 },
      { setNumber: 5, calories: 100 },
    ])]),
    workout('recent', 10, [performed('mixed', [
      { setNumber: 1, reps: 10, weight: 110 },
      { setNumber: 2, reps: 20, bodyweight: true },
      { setNumber: 3, durationSeconds: 120 },
      { setNumber: 4, distance: 20 },
      { setNumber: 5, calories: 200 },
    ])]),
  ], catalog, NOW);
  assert.equal(result.coverage.comparableSignals, 5, 'each supported mode remains a separate like-for-like signal');
  assert.equal(stat(result, 'chest').contributors.length, 5);
  assert.equal(stat(result, 'soleus').score, null, 'muscles without comparable history remain unscored');
  assert.deepEqual(result.muscles.map((entry) => entry.muscle), [...MUSCLES]);
}

function testDevelopmentGrades(): void {
  assert.equal(developmentGrade(100), 'A+');
  assert.equal(developmentGrade(90), 'A+');
  assert.equal(developmentGrade(89.99), 'A');
  assert.equal(developmentGrade(80), 'A');
  assert.equal(developmentGrade(79.99), 'B');
  assert.equal(developmentGrade(70), 'B');
  assert.equal(developmentGrade(69.99), 'C');
  assert.equal(developmentGrade(50), 'C', 'no change is centered at C');
  assert.equal(developmentGrade(49.99), 'D');
  assert.equal(developmentGrade(30), 'D');
  assert.equal(developmentGrade(29.99), 'F');
  assert.equal(developmentGrade(-10), 'F');
  assert.equal(developmentGrade(110), 'A+');
}

function testTopDevelopmentContributors(): void {
  const contributor = (
    label: string,
    change: number,
    allocation: number,
  ): MuscleDevelopmentContributor => ({
    exerciseId: label.toLowerCase(),
    variationId: null,
    label,
    metric: 'reps',
    previousBest: 10,
    recentBest: 10 * (1 + change / 100),
    change,
    allocation,
  });
  const input = [
    contributor('Fourth', -10, 1),
    contributor('Second', -50, 0.5),
    contributor('Third', 20, 1),
    contributor('First', 30, 1),
    contributor('Also third', -40, 0.5),
  ];
  const originalOrder = input.map((entry) => entry.label);

  assert.deepEqual(
    topDevelopmentContributors(input).map((entry) => entry.label),
    ['First', 'Second', 'Also third'],
    'contributors are limited to three and sorted by descending weighted magnitude',
  );
  assert.deepEqual(
    input.map((entry) => entry.label),
    originalOrder,
    'ranking does not mutate the source list',
  );
}

testPerformanceModes();
testWindowsAndExactMappings();
testGeometricAttributionAndRelativeScores();
testAllPositiveAndAllNegativeScaling();
testNullHistoryAndMixedMetrics();
testDevelopmentGrades();
testTopDevelopmentContributors();

console.log('muscle-development tests passed');
