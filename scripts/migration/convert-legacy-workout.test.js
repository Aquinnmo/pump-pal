const assert = require('node:assert/strict');
const { convertLegacyWorkout } = require('./convert-legacy-workout');

const mappingsByLegacyName = {
  'DB Bench': {
    legacyName: 'DB Bench',
    exerciseId: 'bench-press',
    exerciseNameSnapshot: 'Bench Press',
    variationId: 'dumbbell_flat',
    variationNameSnapshot: 'Flat Dumbbell Bench Press',
    status: 'approved',
  },
  Plank: {
    legacyName: 'Plank',
    exerciseId: 'plank',
    exerciseNameSnapshot: 'Plank',
    variationId: null,
    variationNameSnapshot: null,
    status: 'approved',
  },
};

const { convertedWorkout, report } = convertLegacyWorkout({
  userId: 'user-1',
  oldWorkoutId: 'old-1',
  mappingsByLegacyName,
  oldWorkout: {
    name: 'Push',
    notes: 'good lift',
    date: { seconds: 1, nanoseconds: 0 },
    exercises: [
      {
        name: 'DB Bench',
        exerciseType: 'Sets of Reps with Hold',
        sets: 3,
        reps: 8,
        weight: 42.5,
        bodyweight: false,
        holdSeconds: 2,
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
});

assert.equal(convertedWorkout.performedExercises.length, 2);
assert.equal(convertedWorkout.performedExercises[0].sets.length, 3);
assert.equal(convertedWorkout.performedExercises[0].sets[0].weight, 42.5);
assert.equal(convertedWorkout.performedExercises[0].sets[0].holdSeconds, 2);
assert.equal(convertedWorkout.performedExercises[0].variationId, 'dumbbell_flat');
assert.equal(convertedWorkout.performedExercises[1].sets[0].durationSeconds, 90);
assert.equal(report.convertedSetCount, 5);
assert.deepEqual(report.unmapped, []);

console.log('convert-legacy-workout tests passed');
