import assert from "node:assert/strict";
import type {
  PerformedExercise,
  PerformedSet,
  Workout,
} from "@/types/workout";
import { analyzeSetConsistency } from "@/lib/set-consistency";

function exercise(id: string, sets: PerformedSet[]): PerformedExercise {
  return {
    order: 0,
    exerciseId: id,
    exerciseRefPath: `exercises/${id}`,
    exerciseNameSnapshot: id,
    variationId: null,
    variationNameSnapshot: null,
    sets,
  };
}

function workout(
  id: string,
  date: string,
  exercises: PerformedExercise[],
): Workout {
  return {
    id,
    userId: "user",
    name: "Test",
    date: new Date(date),
    performedExercises: exercises,
    schemaVersion: 2,
  };
}

function weighted(values: [number, number][]): PerformedSet[] {
  return values.map(([weight, reps], index) => ({
    setNumber: index + 1,
    weight,
    reps,
  }));
}

function entryWorkout(
  id: string,
  day: number,
  values: [number, number][],
): Workout {
  return workout(
    id,
    `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    [exercise(id, weighted(values))],
  );
}

function testMinimumEvidence(): void {
  const result = analyzeSetConsistency([
    entryWorkout("one", 1, [[100, 10], [100, 10]]),
    entryWorkout("two", 2, [[100, 10], [80, 10]]),
  ]);
  assert.equal(result.category, null);
  assert.equal(result.eligibleEntries, 2);
}

function testFourCategories(): void {
  const stable = (id: string, day: number) =>
    entryWorkout(id, day, [[100, 10], [109, 11]]);
  assert.equal(
    analyzeSetConsistency([
      stable("s1", 1),
      stable("s2", 2),
      stable("s3", 3),
    ]).category,
    "consistent",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("o1", 1, [[100, 10], [90, 10]]),
      entryWorkout("o2", 2, [[100, 10], [100, 8]]),
      stable("o3", 3),
    ]).category,
    "overconfident",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("u1", 1, [[100, 10], [110, 10]]),
      entryWorkout("u2", 2, [[100, 10], [100, 12]]),
      stable("u3", 3),
    ]).category,
    "underconfident",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("up", 1, [[100, 10], [110, 10]]),
      entryWorkout("down", 2, [[100, 10], [90, 10]]),
      stable("steady", 3),
    ]).category,
    "erratic",
  );
}

function testBoundariesAndMixedMovement(): void {
  const exactThresholds = analyzeSetConsistency([
    entryWorkout("weight", 1, [[100, 10], [110, 10]]),
    entryWorkout("reps", 2, [[100, 10], [100, 12]]),
    entryWorkout("below", 3, [[100, 10], [109, 11]]),
  ]);
  assert.equal(exactThresholds.category, "underconfident");
  assert.deepEqual(exactThresholds.entries, {
    stable: 1,
    upward: 2,
    downward: 0,
    mixed: 0,
  });

  const reverseThresholds = analyzeSetConsistency([
    entryWorkout("weight", 1, [[110, 10], [100, 10]]),
    entryWorkout("reps", 2, [[100, 12], [100, 10]]),
    entryWorkout("below", 3, [[109, 11], [100, 10]]),
  ]);
  assert.equal(reverseThresholds.category, "overconfident");
  assert.deepEqual(reverseThresholds.entries, {
    stable: 1,
    upward: 0,
    downward: 2,
    mixed: 0,
  });

  const eightyPercentStable = analyzeSetConsistency([
    entryWorkout("s1", 1, [[100, 10], [100, 10]]),
    entryWorkout("s2", 2, [[100, 10], [100, 10]]),
    entryWorkout("s3", 3, [[100, 10], [100, 10]]),
    entryWorkout("s4", 4, [[100, 10], [100, 10]]),
    entryWorkout("up", 5, [[100, 10], [110, 10]]),
  ]);
  assert.equal(eightyPercentStable.category, "consistent");

  const mixed = analyzeSetConsistency([
    entryWorkout("mixed", 1, [[100, 10], [120, 10], [90, 10]]),
    entryWorkout("s1", 2, [[100, 10], [100, 10]]),
    entryWorkout("s2", 3, [[100, 10], [100, 10]]),
  ]);
  assert.equal(mixed.category, "erratic");
  assert.equal(mixed.entries.mixed, 1);

  const opposingMetrics = analyzeSetConsistency([
    entryWorkout("drop-set", 1, [[100, 10], [80, 12]]),
    entryWorkout("s1", 2, [[100, 10], [100, 10]]),
    entryWorkout("s2", 3, [[100, 10], [100, 10]]),
  ]);
  assert.equal(opposingMetrics.category, "erratic");
  assert.equal(
    opposingMetrics.entries.mixed,
    1,
    "opposing weight and rep changes contribute both directions",
  );
}

function testTrackingModesAndConsecutiveSets(): void {
  const result = analyzeSetConsistency([
    workout("bodyweight", "2026-07-01T12:00:00.000Z", [
      exercise("push-up", [
        { setNumber: 1, reps: 10, bodyweight: true },
        { setNumber: 2, reps: 12, bodyweight: true },
      ]),
    ]),
    workout("duration", "2026-07-02T12:00:00.000Z", [
      exercise("plank", [
        { setNumber: 1, durationSeconds: 30 },
        { setNumber: 2, durationSeconds: 60 },
      ]),
    ]),
    workout("missing", "2026-07-03T12:00:00.000Z", [
      exercise("press", [
        { setNumber: 1, weight: 100, reps: 10 },
        { setNumber: 2 },
        { setNumber: 3, weight: 50, reps: 5 },
      ]),
    ]),
    entryWorkout("steady-a", 4, [[100, 10], [100, 10]]),
    entryWorkout("steady-b", 5, [[100, 10], [100, 10]]),
  ]);

  assert.equal(result.eligibleEntries, 3);
  assert.equal(result.entries.upward, 1);
  assert.equal(result.entries.stable, 2);
  assert.equal(result.category, "underconfident");
}

function testLatestThirtyByWorkoutDate(): void {
  const workouts = Array.from({ length: 30 }, (_, index) =>
    workout(
      `recent-${index}`,
      new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      [exercise(`stable-${index}`, weighted([[100, 10], [100, 10]]))],
    ),
  );
  workouts.unshift(
    workout("older", "2020-01-01T12:00:00.000Z", [
      exercise("older", weighted([[100, 10], [50, 5]])),
    ]),
  );
  workouts.reverse();

  const result = analyzeSetConsistency(workouts);
  assert.equal(result.analyzedWorkouts, 30);
  assert.equal(result.eligibleEntries, 30);
  assert.equal(result.entries.downward, 0);
  assert.equal(result.category, "consistent");
}

testMinimumEvidence();
testFourCategories();
testBoundariesAndMixedMovement();
testTrackingModesAndConsecutiveSets();
testLatestThirtyByWorkoutDate();

console.log("src/lib/set-consistency.test.ts: all assertions passed");
