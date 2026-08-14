import assert from "node:assert/strict";
import type {
  PerformedExercise,
  PerformedSet,
  Workout,
} from "@/types/workout";
import {
  analyzeSetConsistency,
  type SetChangeBucket,
} from "@/lib/set-consistency";

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

function bodyweight(values: number[]): PerformedSet[] {
  return values.map((reps, index) => ({
    setNumber: index + 1,
    bodyweight: true,
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

/** Classify a single exercise by reading back which bucket it landed in. */
function bucketOf(sets: PerformedSet[]): SetChangeBucket | null {
  const result = analyzeSetConsistency([
    workout("probe", "2026-07-01T12:00:00.000Z", [exercise("probe", sets)]),
  ]);
  const hit = Object.entries(result.distribution).find(([, count]) => count > 0);
  return (hit?.[0] as SetChangeBucket) ?? null;
}

// Weight and reps are negatively coupled — a heavier set buys fewer reps — so a
// textbook pyramid must NOT read as erratic just because reps fell while the
// weight climbed. This is the regression that made the verdict disagree with
// the graph.
function testSetSchemes(): void {
  const cases: [string, PerformedSet[], SetChangeBucket][] = [
    ["straight sets", weighted([[100, 10], [100, 10], [100, 10]]), "held"],
    ["straight + rep fade", weighted([[100, 10], [100, 9], [100, 8]]), "held"],
    ["straight + rep crash", weighted([[100, 10], [100, 9], [100, 4]]), "bigDrop"],
    [
      "ascending pyramid",
      weighted([[60, 12], [80, 10], [100, 8], [110, 6]]),
      "bigSpike",
    ],
    ["reverse pyramid", weighted([[110, 6], [100, 8], [80, 10]]), "bigDrop"],
    ["drop set", weighted([[100, 10], [80, 8], [60, 6]]), "bigDrop"],
    [
      "top set + backoff",
      weighted([[120, 5], [100, 8], [100, 8]]),
      "minorDrop",
    ],
    // No single step clears 10%, but the net climb is 20%.
    [
      "gradual ramp",
      weighted([[100, 10], [105, 10], [115, 10], [120, 10]]),
      "minorSpike",
    ],
    [
      "pyramid up then down",
      weighted([[60, 10], [80, 10], [100, 10], [80, 10], [60, 10]]),
      "erratic",
    ],
    ["wandering", weighted([[100, 10], [60, 10], [100, 10]]), "erratic"],
    ["bodyweight rep fade", bodyweight([12, 11, 10, 10]), "held"],
    ["bodyweight collapse", bodyweight([20, 14, 9, 6]), "bigDrop"],
  ];

  cases.forEach(([name, sets, expected]) => {
    assert.equal(bucketOf(sets), expected, `${name} should be ${expected}`);
  });
}

function testIneligibleExercises(): void {
  assert.equal(bucketOf(weighted([[100, 10]])), null, "single set");
  assert.equal(bucketOf([]), null, "no sets");
  assert.equal(
    bucketOf([
      { setNumber: 1, durationSeconds: 60 },
      { setNumber: 2, durationSeconds: 90 },
    ]),
    null,
    "neither weight nor reps logged",
  );
  // Weight logged and perfectly flat, no reps to fall back on.
  assert.equal(
    bucketOf([
      { setNumber: 1, weight: 100 },
      { setNumber: 2, weight: 100 },
    ]),
    "held",
  );
}

function testSetsAreOrderedBySetNumber(): void {
  assert.equal(
    bucketOf([
      { setNumber: 3, weight: 60, reps: 10 },
      { setNumber: 1, weight: 100, reps: 10 },
      { setNumber: 2, weight: 80, reps: 10 },
    ]),
    "bigDrop",
    "out-of-order sets should sort before classifying",
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
  const steady = (id: string, day: number) =>
    entryWorkout(id, day, [[100, 10], [100, 10]]);

  assert.equal(
    analyzeSetConsistency([steady("s1", 1), steady("s2", 2), steady("s3", 3)])
      .category,
    "consistent",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("o1", 1, [[100, 10], [80, 10]]),
      entryWorkout("o2", 2, [[100, 10], [85, 10]]),
      steady("o3", 3),
    ]).category,
    "overconfident",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("u1", 1, [[100, 10], [120, 10]]),
      entryWorkout("u2", 2, [[100, 10], [115, 10]]),
      steady("u3", 3),
    ]).category,
    "underconfident",
  );

  assert.equal(
    analyzeSetConsistency([
      entryWorkout("up", 1, [[100, 10], [120, 10]]),
      entryWorkout("down", 2, [[100, 10], [80, 10]]),
      steady("steady", 3),
    ]).category,
    "erratic",
  );
}

// An exercise that went both ways is evidence on both sides, so a roster of
// pure pyramids-up-then-down reads erratic rather than picking a direction.
function testErraticCountsBothWays(): void {
  const swing = (id: string, day: number) =>
    entryWorkout(id, day, [[60, 10], [100, 10], [60, 10]]);
  const result = analyzeSetConsistency([
    swing("e1", 1),
    swing("e2", 2),
    swing("e3", 3),
  ]);
  assert.equal(result.distribution.erratic, 3);
  assert.equal(result.category, "erratic");
}

function testDistributionTally(): void {
  const result = analyzeSetConsistency([
    workout("dist", "2026-07-01T12:00:00.000Z", [
      exercise("flat", weighted([[100, 10], [100, 10]])),
      exercise("backoff", weighted([[120, 5], [100, 8], [100, 8]])),
      exercise("dropset", weighted([[100, 10], [80, 8], [60, 6]])),
      exercise("ramp", weighted([[100, 10], [105, 10], [115, 10], [120, 10]])),
      exercise("pyramid", weighted([[60, 12], [80, 10], [100, 8], [110, 6]])),
      exercise("swing", weighted([[60, 10], [100, 10], [60, 10]])),
    ]),
  ]);

  assert.deepEqual(result.distribution, {
    bigDrop: 1,
    minorDrop: 1,
    held: 1,
    minorSpike: 1,
    bigSpike: 1,
    erratic: 1,
  });
  assert.equal(result.eligibleEntries, 6);
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
  assert.equal(result.distribution.bigDrop, 0);
  assert.equal(result.category, "consistent");
}

testSetSchemes();
testIneligibleExercises();
testSetsAreOrderedBySetNumber();
testMinimumEvidence();
testFourCategories();
testErraticCountsBothWays();
testDistributionTally();
testLatestThirtyByWorkoutDate();

console.log("src/lib/set-consistency.test.ts: all assertions passed");
