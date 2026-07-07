function durationSeconds(exercise) {
  const minutes = Number(exercise.durationMinutes) || 0;
  const seconds = Number(exercise.durationSeconds) || 0;
  return minutes * 60 + seconds;
}

function convertLegacyExercise(exercise, order, mapping) {
  const sets = Math.max(0, Number(exercise.sets) || 0);
  const isDuration = exercise.exerciseType === 'Sets of Duration';
  const performedSets = [];

  for (let index = 0; index < sets; index += 1) {
    if (isDuration) {
      performedSets.push({
        setNumber: index + 1,
        durationSeconds: durationSeconds(exercise),
      });
    } else {
      const performedSet = {
        setNumber: index + 1,
        reps: Number(exercise.reps) || 0,
        weight: exercise.bodyweight ? 0 : Number(exercise.weight) || 0,
        bodyweight: Boolean(exercise.bodyweight),
      };

      if (exercise.holdSeconds !== undefined) {
        performedSet.holdSeconds = Number(exercise.holdSeconds) || 0;
      }

      performedSets.push(performedSet);
    }
  }

  return {
    order,
    exerciseId: mapping.exerciseId,
    exerciseRefPath: `exercises/${mapping.exerciseId}`,
    exerciseNameSnapshot: mapping.exerciseNameSnapshot,
    variationId: mapping.variationId ?? null,
    variationNameSnapshot: mapping.variationNameSnapshot ?? null,
    sets: performedSets,
    legacy: exercise,
  };
}

function convertLegacyWorkout({ userId, oldWorkoutId, oldWorkout, mappingsByLegacyName }) {
  const performedExercises = [];
  const unmapped = [];

  (oldWorkout.exercises || []).forEach((exercise, order) => {
    const legacyName = String(exercise.name || '').trim();
    const mapping = mappingsByLegacyName[legacyName];

    if (!mapping || mapping.status !== 'approved') {
      unmapped.push(legacyName);
      return;
    }

    performedExercises.push(convertLegacyExercise(exercise, order, mapping));
  });

  return {
    convertedWorkout: {
      userId,
      source: {
        type: 'legacy_user_subcollection',
        path: `users/${userId}/workouts/${oldWorkoutId}`,
        oldWorkoutId,
      },
      name: oldWorkout.name || '',
      date: oldWorkout.date,
      notes: oldWorkout.notes || '',
      performedExercises,
      schemaVersion: 2,
    },
    report: {
      oldPath: `users/${userId}/workouts/${oldWorkoutId}`,
      oldExerciseCount: (oldWorkout.exercises || []).length,
      convertedExerciseCount: performedExercises.length,
      convertedSetCount: performedExercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
      unmapped,
    },
  };
}

module.exports = {
  convertLegacyWorkout,
  convertLegacyExercise,
};
