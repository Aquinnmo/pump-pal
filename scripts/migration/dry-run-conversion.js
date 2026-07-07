const fs = require('node:fs');
const path = require('node:path');
const { convertLegacyWorkout } = require('./convert-legacy-workout');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenSnapshot(snapshot) {
  const workouts = [];

  Object.entries(snapshot.users || {}).forEach(([userId, user]) => {
    Object.entries(user.workouts || {}).forEach(([oldWorkoutId, oldWorkout]) => {
      workouts.push({ userId, oldWorkoutId, oldWorkout });
    });
  });

  return workouts;
}

function indexMappings(mapping) {
  return Object.fromEntries(mapping.mappings.map((item) => [item.legacyName, item]));
}

function oldTotals(workouts) {
  const totals = {
    workoutCount: workouts.length,
    exerciseRowCount: 0,
    setCount: 0,
    reps: 0,
    weightedVolume: 0,
    durationSeconds: 0,
    holdSetSeconds: 0,
  };

  workouts.forEach(({ oldWorkout }) => {
    (oldWorkout.exercises || []).forEach((exercise) => {
      const sets = Number(exercise.sets) || 0;
      const reps = Number(exercise.reps) || 0;
      const weight = exercise.bodyweight ? 0 : Number(exercise.weight) || 0;
      const durationSeconds = (Number(exercise.durationMinutes) || 0) * 60 + (Number(exercise.durationSeconds) || 0);
      const holdSeconds = Number(exercise.holdSeconds) || 0;

      totals.exerciseRowCount += 1;
      totals.setCount += sets;
      totals.reps += sets * reps;
      totals.weightedVolume += sets * reps * weight;
      totals.durationSeconds += sets * durationSeconds;
      totals.holdSetSeconds += sets * holdSeconds;
    });
  });

  return totals;
}

function newTotals(convertedWorkouts) {
  const totals = {
    workoutCount: convertedWorkouts.length,
    exerciseRowCount: 0,
    setCount: 0,
    reps: 0,
    weightedVolume: 0,
    durationSeconds: 0,
    holdSetSeconds: 0,
  };

  convertedWorkouts.forEach((workout) => {
    workout.performedExercises.forEach((exercise) => {
      totals.exerciseRowCount += 1;
      exercise.sets.forEach((set) => {
        const reps = Number(set.reps) || 0;
        const weight = set.bodyweight ? 0 : Number(set.weight) || 0;
        const durationSeconds = Number(set.durationSeconds) || 0;
        const holdSeconds = Number(set.holdSeconds) || 0;

        totals.setCount += 1;
        totals.reps += reps;
        totals.weightedVolume += reps * weight;
        totals.durationSeconds += durationSeconds;
        totals.holdSetSeconds += holdSeconds;
      });
    });
  });

  return totals;
}

function compareTotals(oldValue, newValue) {
  return Object.fromEntries(Object.keys(oldValue).map((key) => [
    key,
    {
      old: oldValue[key],
      new: newValue[key],
      matches: oldValue[key] === newValue[key],
    },
  ]));
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Dry-Run Conversion Report');
  lines.push('');
  lines.push(`- converted workouts: ${report.convertedWorkoutCount}`);
  lines.push(`- unmapped names: ${report.unmappedNames.length}`);
  lines.push(`- parity passed: ${report.parityPassed}`);
  lines.push('');
  lines.push('## Parity');
  lines.push('');
  Object.entries(report.parity).forEach(([key, value]) => {
    lines.push(`- ${key}: old=${value.old}, new=${value.new}, matches=${value.matches}`);
  });
  lines.push('');
  lines.push('## Unmapped Names');
  lines.push('');
  report.unmappedNames.forEach((name) => lines.push(`- ${name}`));
  return `${lines.join('\n')}\n`;
}

function run(argv) {
  const snapshotPath = argv[2] || path.join('migration', 'legacy-workouts.snapshot.json');
  const mappingPath = argv[3] || path.join('migration', 'exercise-mapping.json');
  const outputDir = argv[4] || path.join('migration', 'reports');
  const snapshot = readJson(snapshotPath);
  const mapping = readJson(mappingPath);
  const mappingsByLegacyName = indexMappings(mapping);
  const workouts = flattenSnapshot(snapshot);
  const converted = [];
  const reports = [];
  const unmappedNames = new Set();

  workouts.forEach((item) => {
    const result = convertLegacyWorkout({ ...item, mappingsByLegacyName });
    converted.push(result.convertedWorkout);
    reports.push(result.report);
    result.report.unmapped.forEach((name) => unmappedNames.add(name));
  });

  const oldValue = oldTotals(workouts);
  const newValue = newTotals(converted);
  const parity = compareTotals(oldValue, newValue);
  const parityPassed = Object.values(parity).every((item) => item.matches) && unmappedNames.size === 0;
  const report = {
    convertedWorkoutCount: converted.length,
    unmappedNames: Array.from(unmappedNames).sort(),
    parityPassed,
    parity,
    workoutReports: reports,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'dry-run-conversion.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'dry-run-conversion.md'), formatMarkdown(report));

  console.log(`Converted ${converted.length} workouts`);
  console.log(`Unmapped names: ${unmappedNames.size}`);
  console.log(`Parity passed: ${parityPassed}`);
  if (!parityPassed) process.exit(1);
}

if (require.main === module) run(process.argv);

