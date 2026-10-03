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

/** One exercise at a constant 10 reps, one entry per weight. */
function weightsWorkout(id: string, day: number, weights: number[]): Workout {
  return entryWorkout(
    id,
    day,
    weights.map((weight): [number, number] => [weight, 10]),
  );
}

/** A full distribution with zeros filled in, so cases only name what they hit. */
function counts(
  partial: Partial<Record<SetChangeBucket, number>>,
): Record<SetChangeBucket, number> {
  return {
    bigDrop: 0,
    minorDrop: 0,
    held: 0,
    minorSpike: 0,
    bigSpike: 0,
    ...partial,
  };
}

/** The set-to-set changes a single exercise contributes. */
function deltasOf(sets: PerformedSet[]): Record<SetChangeBucket, number> {
  return analyzeSetConsistency([
    workout("probe", "2026-07-01T12:00:00.000Z", [exercise("probe", sets)]),
  ]).distribution;
}

// Weight and reps are negatively coupled — a heavier set buys fewer reps — so a
// textbook pyramid must NOT read as drops just because reps fell while the
// weight climbed. Each delta is judged on weight when it moved, reps otherwise.
function testSetSchemes(): void {
  const cases: [
    string,
    PerformedSet[],
    Partial<Record<SetChangeBucket, number>>,
  ][] = [
    ["straight sets", weighted([[100, 10], [100, 10], [100, 10]]), { held: 2 }],
    [
      "straight + rep fade",
      weighted([[100, 10], [100, 9], [100, 8]]),
      { held: 2 },
    ],
    [
      "straight + rep crash",
      weighted([[100, 10], [100, 9], [100, 4]]),
      { held: 1, bigDrop: 1 },
    ],
    [
      "ascending pyramid",
      weighted([[60, 12], [80, 10], [100, 8], [115, 6]]),
      { bigSpike: 2, minorSpike: 1 },
    ],
    [
      "reverse pyramid",
      weighted([[120, 6], [100, 8], [75, 10]]),
      { minorDrop: 1, bigDrop: 1 },
    ],
    ["drop set", weighted([[100, 10], [80, 8], [60, 6]]), { bigDrop: 2 }],
    [
      "top set + backoff",
      weighted([[120, 5], [100, 8], [100, 8]]),
      { minorDrop: 1, held: 1 },
    ],
    // No single step clears 10%: every delta reads as held, unlike a net view.
    [
      "gradual ramp",
      weighted([[100, 10], [105, 10], [115, 10], [120, 10]]),
      { held: 3 },
    ],
    [
      "pyramid up then down",
      weighted([[60, 10], [80, 10], [100, 10], [80, 10], [60, 10]]),
      { bigSpike: 2, bigDrop: 2 },
    ],
    [
      "wandering",
      weighted([[100, 10], [60, 10], [100, 10]]),
      { bigDrop: 1, bigSpike: 1 },
    ],
    ["bodyweight rep fade", bodyweight([12, 11, 10, 10]), { held: 3 }],
    ["bodyweight collapse", bodyweight([20, 14, 9, 6]), { minorDrop: 3 }],
  ];

  cases.forEach(([name, sets, expected]) => {
    assert.deepEqual(deltasOf(sets), counts(expected), name);
  });
}

function testIneligibleExercises(): void {
  assert.deepEqual(deltasOf(weighted([[100, 10]])), counts({}), "single set");
  assert.deepEqual(deltasOf([]), counts({}), "no sets");
  assert.deepEqual(
    deltasOf([
      { setNumber: 1, durationSeconds: 60 },
      { setNumber: 2, durationSeconds: 90 },
    ]),
    counts({}),
    "neither weight nor reps logged",
  );
  // Weight logged and perfectly flat, no reps to fall back on.
  assert.deepEqual(
    deltasOf([
      { setNumber: 1, weight: 100 },
      { setNumber: 2, weight: 100 },
    ]),
    counts({ held: 1 }),
  );
}

function testSetsAreOrderedBySetNumber(): void {
  assert.deepEqual(
    deltasOf([
      { setNumber: 3, weight: 60, reps: 10 },
      { setNumber: 1, weight: 100, reps: 10 },
      { setNumber: 2, weight: 80, reps: 10 },
    ]),
    counts({ bigDrop: 2 }),
    "out-of-order sets should sort before classifying",
  );
}

function testDropSetsAreSkipped(): void {
  // Two drop sets of 185 → 135: one held set-to-set change, not two big drops.
  assert.deepEqual(
    deltasOf([
      { setNumber: 1, weight: 185, reps: 8, type: "drop" },
      { setNumber: 1, weight: 135, reps: 6, type: "drop" },
      { setNumber: 2, weight: 185, reps: 8, type: "drop" },
      { setNumber: 2, weight: 135, reps: 6, type: "drop" },
    ]),
    counts({ held: 1 }),
    "drop sets should not count as set-to-set drops",
  );
}

function testMinimumEvidence(): void {
  // Five deltas from one long exercise: still short of the six needed.
  const thin = analyzeSetConsistency([
    weightsWorkout("thin", 1, [100, 100, 100, 100, 100, 100]),
  ]);
  assert.equal(thin.category, null);
  assert.equal(thin.eligibleEntries, 5);

  const enough = analyzeSetConsistency([
    weightsWorkout("a", 1, [100, 100, 100, 100]),
    weightsWorkout("b", 2, [100, 100, 100, 100]),
  ]);
  assert.equal(enough.eligibleEntries, 6);
  assert.equal(enough.category, "held");
}

// Verdict is the most common kind of move once held drops under 80%.
function testVerdict(): void {
  const steady = (id: string, day: number) =>
    weightsWorkout(id, day, [100, 100, 100, 100]);
  const verdict = (...workouts: Workout[]) =>
    analyzeSetConsistency(workouts).category;

  assert.equal(
    verdict(weightsWorkout("bd", 1, [100, 70, 45, 25]), steady("s", 2)),
    "bigDrop",
  );
  assert.equal(
    verdict(weightsWorkout("md", 1, [100, 85, 70, 55]), steady("s", 2)),
    "minorDrop",
  );
  assert.equal(
    verdict(weightsWorkout("ms", 1, [100, 115, 130, 150]), steady("s", 2)),
    "minorSpike",
  );
  assert.equal(
    verdict(weightsWorkout("bs", 1, [50, 80, 120, 180]), steady("s", 2)),
    "bigSpike",
  );
  // A tie goes to the earlier bucket in graph order.
  assert.equal(
    verdict(
      weightsWorkout("t1", 1, [100, 70, 100]),
      weightsWorkout("t2", 2, [100, 70, 100]),
      weightsWorkout("t3", 3, [100, 70, 100]),
    ),
    "bigDrop",
  );
}

function testDistributionTally(): void {
  const result = analyzeSetConsistency([
    workout("dist", "2026-07-01T12:00:00.000Z", [
      exercise("flat", weighted([[100, 10], [100, 10]])),
      exercise("backoff", weighted([[120, 5], [100, 8], [100, 8]])),
      exercise("dropset", weighted([[100, 10], [80, 8], [60, 6]])),
      exercise("pyramid", weighted([[60, 12], [80, 10], [100, 8], [115, 6]])),
    ]),
  ]);

  assert.deepEqual(
    result.distribution,
    counts({ bigDrop: 2, minorDrop: 1, held: 2, minorSpike: 1, bigSpike: 2 }),
  );
  assert.equal(result.eligibleEntries, 8);
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
  assert.equal(result.category, "held");
}

testSetSchemes();
testIneligibleExercises();
testSetsAreOrderedBySetNumber();
testDropSetsAreSkipped();
testMinimumEvidence();
testVerdict();
testDistributionTally();
testLatestThirtyByWorkoutDate();

console.log("src/lib/set-consistency.test.ts: all assertions passed");
