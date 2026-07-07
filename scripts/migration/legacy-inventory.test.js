const assert = require('node:assert/strict');
const { inspectWorkouts, normalizeWorkoutInput } = require('./legacy-inventory');
const { guessExerciseId } = require('./generate-mapping-draft');
const { validateMapping } = require('./validate-mapping');

const input = {
  users: {
    user1: {
      workouts: {
        workout1: {
          name: 'Push',
          date: { seconds: 1, nanoseconds: 0 },
          exercises: [
            {
              name: 'DB Bench',
              exerciseType: 'Sets of Reps',
              sets: 3,
              reps: 8,
              weight: 42.5,
              bodyweight: false,
              unexpected: true,
            },
            {
              name: 'Plank',
              exerciseType: 'Sets of Duration',
              sets: 2,
              durationMinutes: 1,
              durationSeconds: 30,
            },
          ],
        },
      },
    },
  },
};

const workouts = normalizeWorkoutInput(input);
const report = inspectWorkouts(workouts);

assert.equal(workouts.length, 1);
assert.equal(report.summary.userCount, 1);
assert.equal(report.summary.workoutCount, 1);
assert.equal(report.summary.oldExerciseRowCount, 2);
assert.equal(report.summary.aggregateSetCount, 5);
assert.equal(report.summary.distinctExerciseNameCount, 2);
assert.equal(report.summary.durationRows, 1);
assert.equal(report.decimalWeights[0].weight, 42.5);
assert.equal(report.unknownFields.exercise[0].field, 'unexpected');
assert.equal(guessExerciseId('DB Bench'), 'dumbbell-bench');

const errors = validateMapping({
  catalog: {
    exercises: [
      {
        id: 'bench-press',
        variations: [{ id: 'dumbbell_flat' }],
      },
    ],
  },
  mapping: {
    mappings: [
      {
        legacyName: 'DB Bench',
        exerciseId: 'bench-press',
        variationId: 'dumbbell_flat',
        status: 'approved',
      },
    ],
  },
});

assert.deepEqual(errors, []);

console.log('legacy-inventory tests passed');

