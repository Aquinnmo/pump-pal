const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { convertLegacyWorkout } = require('./convert-legacy-workout');
const { getAccessToken } = require('./firestore-readonly-snapshot');
const { firestoreTimestamp, patchDocument, timestampShapeToIso } = require('./seed-exercise-catalog');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const args = {
    apply: false,
    snapshotPath: path.join('migration', 'legacy-workouts.snapshot.json'),
    mappingPath: path.join('migration', 'exercise-mapping.json'),
    credentialPath: 'pumppal-read-only-perms.json',
    outputDir: path.join('migration', 'reports'),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--snapshot') {
      args.snapshotPath = argv[index + 1];
      index += 1;
    } else if (arg === '--mapping') {
      args.mappingPath = argv[index + 1];
      index += 1;
    } else if (arg === '--credential') {
      args.credentialPath = argv[index + 1];
      index += 1;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function flattenSnapshot(snapshot) {
  const workouts = [];

  Object.entries(snapshot.users || {}).forEach(([userId, user]) => {
    Object.entries(user.workouts || {}).forEach(([oldWorkoutId, oldWorkout]) => {
      workouts.push({ userId, oldWorkoutId, oldWorkout });
    });
  });

  if (Array.isArray(snapshot.workouts)) {
    snapshot.workouts.forEach((oldWorkout) => {
      workouts.push({
        userId: oldWorkout.userId,
        oldWorkoutId: oldWorkout.oldWorkoutId,
        oldWorkout,
      });
    });
  }

  return workouts;
}

function indexMappings(mapping) {
  return Object.fromEntries(mapping.mappings.map((item) => [item.legacyName, item]));
}

function targetWorkoutId({ userId, oldWorkoutId }) {
  const source = `users/${userId}/workouts/${oldWorkoutId}`;
  return `legacy_${crypto.createHash('sha256').update(source).digest('hex').slice(0, 24)}`;
}

function normalizeWorkoutForWrite(workout, now) {
  const dateIso = timestampShapeToIso(workout.date);

  return {
    ...workout,
    date: dateIso ? firestoreTimestamp(dateIso) : workout.date || null,
    createdAt: firestoreTimestamp(now),
    updatedAt: firestoreTimestamp(now),
  };
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
      const seconds = (Number(exercise.durationMinutes) || 0) * 60 + (Number(exercise.durationSeconds) || 0);
      const holdSeconds = Number(exercise.holdSeconds) || 0;

      totals.exerciseRowCount += 1;
      totals.setCount += sets;
      totals.reps += sets * reps;
      totals.weightedVolume += sets * reps * weight;
      totals.durationSeconds += sets * seconds;
      totals.holdSetSeconds += sets * holdSeconds;
    });
  });

  return totals;
}

function newTotals(workouts) {
  const totals = {
    workoutCount: workouts.length,
    exerciseRowCount: 0,
    setCount: 0,
    reps: 0,
    weightedVolume: 0,
    durationSeconds: 0,
    holdSetSeconds: 0,
  };

  workouts.forEach((workout) => {
    workout.performedExercises.forEach((exercise) => {
      totals.exerciseRowCount += 1;
      exercise.sets.forEach((set) => {
        const reps = Number(set.reps) || 0;
        const weight = set.bodyweight ? 0 : Number(set.weight) || 0;
        const seconds = Number(set.durationSeconds) || 0;
        const holdSeconds = Number(set.holdSeconds) || 0;

        totals.setCount += 1;
        totals.reps += reps;
        totals.weightedVolume += reps * weight;
        totals.durationSeconds += seconds;
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
  lines.push('# Workout Write Plan');
  lines.push('');
  lines.push(`- apply: ${report.apply}`);
  lines.push(`- project: ${report.projectId || 'not loaded in dry-run'}`);
  lines.push(`- planned writes: ${report.plannedWriteCount}`);
  lines.push(`- applied writes: ${report.appliedWriteCount}`);
  lines.push(`- unmapped names: ${report.unmappedNames.length}`);
  lines.push(`- parity passed: ${report.parityPassed}`);
  lines.push('');
  lines.push('## Parity');
  lines.push('');
  Object.entries(report.parity).forEach(([key, value]) => {
    lines.push(`- ${key}: old=${value.old}, new=${value.new}, matches=${value.matches}`);
  });
  lines.push('');
  lines.push('## Planned Docs');
  lines.push('');
  report.plannedWrites.slice(0, 30).forEach((write) => {
    lines.push(`- ${write.documentPath} from ${write.sourcePath}`);
  });
  if (report.plannedWrites.length > 30) {
    lines.push(`- ... ${report.plannedWrites.length - 30} more`);
  }
  return `${lines.join('\n')}\n`;
}

function buildPlan({ snapshotPath, mappingPath }) {
  const snapshot = readJson(snapshotPath);
  const mapping = readJson(mappingPath);
  const mappingsByLegacyName = indexMappings(mapping);
  const legacyWorkouts = flattenSnapshot(snapshot);
  const now = new Date().toISOString();
  const unmappedNames = new Set();
  const plannedWrites = [];
  const convertedWorkouts = [];

  legacyWorkouts.forEach((item) => {
    const result = convertLegacyWorkout({ ...item, mappingsByLegacyName });
    result.report.unmapped.forEach((name) => unmappedNames.add(name));

    const workoutId = targetWorkoutId(item);
    const data = normalizeWorkoutForWrite(result.convertedWorkout, now);
    convertedWorkouts.push(data);
    plannedWrites.push({
      documentPath: `workouts/${workoutId}`,
      sourcePath: result.report.oldPath,
      userId: item.userId,
      oldWorkoutId: item.oldWorkoutId,
      convertedExerciseCount: result.report.convertedExerciseCount,
      convertedSetCount: result.report.convertedSetCount,
      data,
    });
  });

  const parity = compareTotals(oldTotals(legacyWorkouts), newTotals(convertedWorkouts));
  const parityPassed = Object.values(parity).every((item) => item.matches) && unmappedNames.size === 0;

  return {
    parity,
    parityPassed,
    unmappedNames: Array.from(unmappedNames).sort(),
    plannedWrites,
  };
}

async function writeMigratedWorkouts(args) {
  const plan = buildPlan(args);
  let projectId = null;
  let appliedWriteCount = 0;

  if (!plan.parityPassed) {
    return {
      apply: args.apply,
      projectId,
      plannedWriteCount: plan.plannedWrites.length,
      appliedWriteCount,
      ...plan,
    };
  }

  if (args.apply) {
    const serviceAccount = readJson(args.credentialPath);
    const accessToken = await getAccessToken(serviceAccount);
    projectId = serviceAccount.project_id;

    for (const write of plan.plannedWrites) {
      await patchDocument({
        accessToken,
        projectId,
        documentPath: write.documentPath,
        data: write.data,
      });
      appliedWriteCount += 1;
    }
  }

  return {
    apply: args.apply,
    projectId,
    plannedWriteCount: plan.plannedWrites.length,
    appliedWriteCount,
    ...plan,
  };
}

function writeReports(result, outputDir) {
  const report = {
    ...result,
    plannedWrites: result.plannedWrites.map((write) => ({
      documentPath: write.documentPath,
      sourcePath: write.sourcePath,
      userId: write.userId,
      oldWorkoutId: write.oldWorkoutId,
      convertedExerciseCount: write.convertedExerciseCount,
      convertedSetCount: write.convertedSetCount,
    })),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'workout-write-plan.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'workout-write-plan.md'), formatMarkdown(report));
}

async function run(argv) {
  const args = parseArgs(argv);
  const result = await writeMigratedWorkouts(args);
  writeReports(result, args.outputDir);

  console.log(result.apply ? `Applied project ${result.projectId}` : 'Dry run only; no Firestore writes');
  console.log(`Planned workout docs: ${result.plannedWriteCount}`);
  console.log(`Applied workout docs: ${result.appliedWriteCount}`);
  console.log(`Unmapped names: ${result.unmappedNames.length}`);
  console.log(`Parity passed: ${result.parityPassed}`);

  if (!result.parityPassed) process.exit(1);
  if (!result.apply) console.log('Run with --apply and a write-capable service account to write Firestore.');
}

if (require.main === module) {
  run(process.argv).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildPlan,
  writeMigratedWorkouts,
  targetWorkoutId,
};
