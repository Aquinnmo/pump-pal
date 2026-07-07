const fs = require('node:fs');
const path = require('node:path');

const KNOWN_WORKOUT_FIELDS = new Set(['id', 'name', 'date', 'exercises', 'notes']);
const KNOWN_EXERCISE_FIELDS = new Set([
  'name',
  'exerciseType',
  'sets',
  'reps',
  'weight',
  'bodyweight',
  'durationMinutes',
  'durationSeconds',
  'holdSeconds',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWorkoutInput(input) {
  if (Array.isArray(input)) {
    return input.map((item) => ({
      userId: item.userId,
      oldWorkoutId: item.oldWorkoutId || item.id,
      data: item.data || item,
    }));
  }

  if (Array.isArray(input.workouts)) {
    return input.workouts.map((item) => ({
      userId: item.userId,
      oldWorkoutId: item.oldWorkoutId || item.id,
      data: item.data || item,
    }));
  }

  if (Array.isArray(input.users)) {
    return input.users.flatMap((user) => normalizeUserWorkouts(user.id || user.userId, user.workouts));
  }

  if (input.users && typeof input.users === 'object') {
    return Object.entries(input.users).flatMap(([userId, user]) => {
      const workouts = user.workouts || user;
      return normalizeUserWorkouts(userId, workouts);
    });
  }

  return [];
}

function normalizeUserWorkouts(userId, workouts) {
  if (!workouts) return [];

  if (Array.isArray(workouts)) {
    return workouts.map((workout) => ({
      userId,
      oldWorkoutId: workout.oldWorkoutId || workout.id,
      data: workout.data || workout,
    }));
  }

  if (typeof workouts === 'object') {
    return Object.entries(workouts).map(([oldWorkoutId, data]) => ({
      userId,
      oldWorkoutId,
      data: data.data || data,
    }));
  }

  return [];
}

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function inspectWorkouts(workouts) {
  const users = new Set();
  const exerciseNames = new Map();
  const workoutUnknownFields = new Map();
  const exerciseUnknownFields = new Map();
  const exerciseTypeCounts = {};
  const issues = [];
  const decimalWeights = [];
  let oldExerciseRowCount = 0;
  let aggregateSetCount = 0;
  let bodyweightRows = 0;
  let durationRows = 0;

  workouts.forEach(({ userId, oldWorkoutId, data }, workoutIndex) => {
    const workoutPath = `users/${userId || 'UNKNOWN_USER'}/workouts/${oldWorkoutId || `UNKNOWN_${workoutIndex}`}`;
    if (userId) users.add(userId);

    Object.keys(data || {}).forEach((field) => {
      if (!KNOWN_WORKOUT_FIELDS.has(field)) addToMapSet(workoutUnknownFields, field, workoutPath);
    });

    if (!data || !Array.isArray(data.exercises)) {
      issues.push({ path: workoutPath, type: 'missing_exercises_array' });
      return;
    }

    data.exercises.forEach((exercise, exerciseIndex) => {
      oldExerciseRowCount += 1;
      const legacyName = String(exercise.name || '').trim();
      const exercisePath = `${workoutPath}/exercises[${exerciseIndex}]`;

      if (!legacyName) {
        issues.push({ path: exercisePath, type: 'missing_exercise_name' });
      } else {
        addToMapSet(exerciseNames, legacyName, workoutPath);
      }

      Object.keys(exercise || {}).forEach((field) => {
        if (!KNOWN_EXERCISE_FIELDS.has(field)) addToMapSet(exerciseUnknownFields, field, exercisePath);
      });

      const sets = Number(exercise.sets);
      if (!Number.isFinite(sets) || sets < 0) {
        issues.push({ path: exercisePath, type: 'invalid_sets', value: exercise.sets });
      } else {
        aggregateSetCount += sets;
      }

      const exerciseType = exercise.exerciseType || 'Sets of Reps';
      exerciseTypeCounts[exerciseType] = (exerciseTypeCounts[exerciseType] || 0) + 1;

      if (exercise.bodyweight) bodyweightRows += 1;
      if (exerciseType === 'Sets of Duration') durationRows += 1;

      const weight = Number(exercise.weight);
      if (Number.isFinite(weight) && !Number.isInteger(weight)) {
        decimalWeights.push({ path: exercisePath, name: legacyName, weight });
      }
    });
  });

  return {
    summary: {
      userCount: users.size,
      workoutCount: workouts.length,
      oldExerciseRowCount,
      aggregateSetCount,
      distinctExerciseNameCount: exerciseNames.size,
      bodyweightRows,
      durationRows,
      issueCount: issues.length,
    },
    exerciseTypeCounts,
    exerciseNames: Array.from(exerciseNames.entries())
      .map(([name, paths]) => ({ name, count: paths.size, samplePaths: Array.from(paths).slice(0, 5) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    unknownFields: {
      workout: mapSetToArray(workoutUnknownFields),
      exercise: mapSetToArray(exerciseUnknownFields),
    },
    decimalWeights,
    issues,
  };
}

function mapSetToArray(map) {
  return Array.from(map.entries())
    .map(([field, paths]) => ({ field, count: paths.size, samplePaths: Array.from(paths).slice(0, 5) }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Legacy Workout Inventory');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  Object.entries(report.summary).forEach(([key, value]) => {
    lines.push(`- ${key}: ${value}`);
  });
  lines.push('');
  lines.push('## Exercise Names');
  lines.push('');
  report.exerciseNames.forEach((item) => {
    lines.push(`- ${item.name}: ${item.count}`);
  });
  lines.push('');
  lines.push('## Unknown Fields');
  lines.push('');
  lines.push('### Workout');
  report.unknownFields.workout.forEach((item) => lines.push(`- ${item.field}: ${item.count}`));
  lines.push('');
  lines.push('### Exercise');
  report.unknownFields.exercise.forEach((item) => lines.push(`- ${item.field}: ${item.count}`));
  lines.push('');
  lines.push('## Issues');
  lines.push('');
  report.issues.forEach((issue) => lines.push(`- ${issue.type}: ${issue.path}`));
  return `${lines.join('\n')}\n`;
}

function run(argv) {
  const inputPath = argv[2];
  const outputDir = argv[3] || path.join('migration', 'reports');

  if (!inputPath) {
    console.error('Usage: node scripts/migration/legacy-inventory.js <legacy-workouts.json> [output-dir]');
    process.exit(1);
  }

  const input = readJson(inputPath);
  const workouts = normalizeWorkoutInput(input);
  const report = inspectWorkouts(workouts);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'legacy-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'legacy-inventory.md'), formatMarkdown(report));

  console.log(`Scanned ${report.summary.workoutCount} workouts`);
  console.log(`Found ${report.summary.distinctExerciseNameCount} distinct exercise names`);
  console.log(`Wrote ${path.join(outputDir, 'legacy-inventory.json')}`);
}

if (require.main === module) run(process.argv);

module.exports = {
  normalizeWorkoutInput,
  inspectWorkouts,
};
