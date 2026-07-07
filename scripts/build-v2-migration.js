#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXPORT_FILE = path.join(ROOT, 'temp', 'firestore-workouts-export.json');
const MAPPING_FILE = path.join(ROOT, 'migration', 'exercise-name-map.json');
const USERS_OUT = path.join(ROOT, 'temp', 'v2-users.json');
const WORKOUTS_OUT = path.join(ROOT, 'temp', 'v2-workouts.json');
const EXERCISES_OUT = path.join(ROOT, 'temp', 'v2-exercises.json');
const REPORT_OUT = path.join(ROOT, 'temp', 'v2-migration-report.json');

const SUPPORTED_EXERCISE_TYPES = new Set(['Sets of Reps', 'Sets of Duration', 'Sets of Reps with Hold']);
const VALID_REVIEW_STATUSES = new Set(['needs-review', 'approved', 'rejected']);

main();

function main() {
  const exportData = readJson(EXPORT_FILE);
  const mapping = readJson(MAPPING_FILE);
  const migrationStartedAt = new Date().toISOString();
  const source = collectSource(exportData);
  const validation = validateSourceAndMapping(source, mapping);

  const report = {
    schemaVersion: 2,
    generatedAt: migrationStartedAt,
    sourceExport: relative(EXPORT_FILE),
    sourceExportedAt: exportData.exportedAt || null,
    targetCollections: {
      users: 'v2-users',
      workouts: 'v2-users/{uid}/v2-workouts',
      exercises: 'v2-exercises',
    },
    sourceCounts: {
      users: source.users.length,
      workouts: source.workouts.length,
      workoutExercises: source.workoutExerciseCount,
      uniqueExerciseNames: source.exerciseNames.size,
      uniqueExerciseIds: countMappedExerciseIds(source, mapping),
    },
    outputCounts: {
      users: 0,
      workouts: 0,
      exercises: 0,
    },
    blockers: validation.blockers,
    warnings: validation.warnings,
    passed: validation.blockers.length === 0,
  };

  fs.mkdirSync(path.dirname(REPORT_OUT), { recursive: true });

  if (!report.passed) {
    writeJson(REPORT_OUT, report);
    console.error('v2 migration blocked. See temp/v2-migration-report.json.');
    for (const blocker of validation.blockers.slice(0, 20)) {
      console.error(`- ${blocker.message}`);
    }
    if (validation.blockers.length > 20) {
      console.error(`- ...and ${validation.blockers.length - 20} more blockers`);
    }
    process.exitCode = 1;
    return;
  }

  const v2 = buildV2Artifacts(exportData, source, mapping, migrationStartedAt);
  report.outputCounts = {
    users: v2.users.length,
    workouts: v2.workouts.length,
    exercises: v2.exercises.length,
  };

  const countErrors = validateOutputCounts(report);
  report.blockers.push(...countErrors);
  report.passed = report.blockers.length === 0;

  if (!report.passed) {
    writeJson(REPORT_OUT, report);
    console.error('v2 migration output validation failed. See temp/v2-migration-report.json.');
    process.exitCode = 1;
    return;
  }

  writeJson(USERS_OUT, {
    schemaVersion: 2,
    generatedAt: migrationStartedAt,
    targetCollection: 'v2-users',
    users: v2.users,
  });
  writeJson(WORKOUTS_OUT, {
    schemaVersion: 2,
    generatedAt: migrationStartedAt,
    targetCollectionPattern: 'v2-users/{uid}/v2-workouts',
    workouts: v2.workouts,
  });
  writeJson(EXERCISES_OUT, {
    schemaVersion: 2,
    generatedAt: migrationStartedAt,
    targetCollection: 'v2-exercises',
    exercises: v2.exercises,
  });
  writeJson(REPORT_OUT, report);

  console.log('v2 migration artifacts generated.');
  console.log(`Wrote ${relative(USERS_OUT)}`);
  console.log(`Wrote ${relative(WORKOUTS_OUT)}`);
  console.log(`Wrote ${relative(EXERCISES_OUT)}`);
  console.log(`Wrote ${relative(REPORT_OUT)}`);
}

function collectSource(exportData) {
  const users = exportData.users || [];
  const workouts = [];
  const exerciseNames = new Set();
  const exerciseTypeCounts = new Map();
  const namesByExerciseType = new Map();
  let workoutExerciseCount = 0;

  for (const user of users) {
    for (const workout of user.workouts || []) {
      workouts.push({ user, workout });
      for (const exercise of workout.data?.exercises || []) {
        const name = normalizeName(exercise.name);
        if (!name) continue;

        const exerciseType = normalizeName(exercise.exerciseType) || 'Sets of Reps';
        exerciseNames.add(name);
        increment(exerciseTypeCounts, exerciseType);
        if (!namesByExerciseType.has(exerciseType)) {
          namesByExerciseType.set(exerciseType, new Set());
        }
        namesByExerciseType.get(exerciseType).add(name);
        workoutExerciseCount += 1;
      }
    }
  }

  return {
    users,
    workouts,
    exerciseNames,
    exerciseTypeCounts,
    namesByExerciseType,
    workoutExerciseCount,
  };
}

function validateSourceAndMapping(source, mapping) {
  const blockers = [];
  const warnings = [];
  const mappings = mapping.mappings || {};

  for (const sourceName of source.exerciseNames) {
    const mapped = mappings[sourceName];
    if (!mapped) {
      blockers.push(blocker('missing-mapping', `Missing mapping for "${sourceName}"`, { sourceName }));
      continue;
    }

    if (!VALID_REVIEW_STATUSES.has(mapped.reviewStatus)) {
      blockers.push(blocker('invalid-review-status', `Mapping for "${sourceName}" has invalid reviewStatus "${mapped.reviewStatus}"`, { sourceName }));
    }

    if (mapped.reviewStatus !== 'approved') {
      blockers.push(blocker('unapproved-mapping', `Mapping for "${sourceName}" is "${mapped.reviewStatus}", not "approved"`, { sourceName }));
    }

    if (!mapped.exerciseId || typeof mapped.exerciseId !== 'string') {
      blockers.push(blocker('missing-exercise-id', `Mapping for "${sourceName}" has no exerciseId`, { sourceName }));
      continue;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapped.exerciseId)) {
      blockers.push(blocker('invalid-exercise-id', `Mapping for "${sourceName}" has invalid exerciseId "${mapped.exerciseId}"`, { sourceName, exerciseId: mapped.exerciseId }));
    }

    if (!mapped.displayName || typeof mapped.displayName !== 'string') {
      blockers.push(blocker('missing-display-name', `Mapping for "${sourceName}" has no displayName`, { sourceName }));
    }

    const flagErrors = validateDefaultFlags(mapped.defaultFlags, sourceName);
    blockers.push(...flagErrors);
  }

  for (const staleName of Object.keys(mappings)) {
    if (!source.exerciseNames.has(staleName)) {
      blockers.push(blocker('stale-mapping', `Mapping includes stale source name "${staleName}"`, { sourceName: staleName }));
    }
  }

  for (const [exerciseType, count] of source.exerciseTypeCounts.entries()) {
    if (!SUPPORTED_EXERCISE_TYPES.has(exerciseType)) {
      blockers.push(blocker('unsupported-exercise-type', `Unsupported exercise type "${exerciseType}" appears ${count} time(s)`, {
        exerciseType,
        count,
        names: [...(source.namesByExerciseType.get(exerciseType) || [])].sort(),
      }));
    }
  }

  for (const [exerciseType, names] of source.namesByExerciseType.entries()) {
    if (SUPPORTED_EXERCISE_TYPES.has(exerciseType)) continue;
    warnings.push({
      code: 'resolve-unsupported-exercise-type',
      message: `Resolve "${exerciseType}" before v2 artifacts can be generated.`,
      names: [...names].sort(),
    });
  }

  return { blockers, warnings };
}

function buildV2Artifacts(exportData, source, mapping, migratedAt) {
  const v2Users = [];
  const v2Workouts = [];
  const exerciseSources = new Map();

  for (const user of exportData.users || []) {
    v2Users.push({
      uid: user.userId,
      path: `v2-users/${user.userId}`,
      data: {
        ...user.data,
        schemaVersion: 2,
        sourceUserPath: user.userPath || `users/${user.userId}`,
        migratedAt,
      },
    });

    for (const workout of user.workouts || []) {
      const workoutData = workout.data || {};
      const exercises = (workoutData.exercises || []).map((exercise, index) => {
        const sourceName = normalizeName(exercise.name);
        const mapped = mapping.mappings[sourceName];
        if (!exerciseSources.has(mapped.exerciseId)) {
          exerciseSources.set(mapped.exerciseId, {
            exerciseId: mapped.exerciseId,
            sourceNames: new Set(),
            displayName: mapped.displayName,
            trackingModes: new Set(),
            bodyweightValues: new Set(),
          });
        }
        const sourceEntry = exerciseSources.get(mapped.exerciseId);
        const exerciseType = normalizeExerciseType(exercise.exerciseType);
        const flags = buildUsageFlags(mapped.defaultFlags, exercise);
        sourceEntry.sourceNames.add(sourceName);
        sourceEntry.trackingModes.add(exerciseType);
        sourceEntry.bodyweightValues.add(Boolean(exercise.bodyweight));

        return cleanUndefined({
          order: index,
          exerciseId: mapped.exerciseId,
          sourceName,
          exerciseType,
          flags,
          sets: numberOrZero(exercise.sets),
          reps: exerciseType === 'Sets of Duration' ? undefined : numberOrZero(exercise.reps),
          weight: exerciseType === 'Sets of Duration' ? undefined : numberOrZero(exercise.weight),
          bodyweight: exerciseType === 'Sets of Duration' ? undefined : Boolean(exercise.bodyweight),
          durationMinutes: exerciseType === 'Sets of Duration' ? numberOrZero(exercise.durationMinutes) : undefined,
          durationSeconds: exerciseType === 'Sets of Duration' ? numberOrZero(exercise.durationSeconds) : undefined,
        });
      });

      v2Workouts.push({
        uid: user.userId,
        workoutId: workout.workoutId,
        path: `v2-users/${user.userId}/v2-workouts/${workout.workoutId}`,
        data: {
          name: workoutData.name || '',
          date: workoutData.date || null,
          notes: workoutData.notes || '',
          exercises,
          schemaVersion: 2,
          sourceWorkoutPath: workout.path || `users/${user.userId}/workouts/${workout.workoutId}`,
          migratedAt,
        },
      });
    }
  }

  for (const [sourceName, mapped] of Object.entries(mapping.mappings || {})) {
    if (!source.exerciseNames.has(sourceName)) continue;
    if (!exerciseSources.has(mapped.exerciseId)) {
      exerciseSources.set(mapped.exerciseId, {
        exerciseId: mapped.exerciseId,
        sourceNames: new Set(),
        displayName: mapped.displayName,
        trackingModes: new Set(),
        bodyweightValues: new Set(),
      });
    }
    exerciseSources.get(mapped.exerciseId).sourceNames.add(sourceName);
  }

  const v2Exercises = [...exerciseSources.values()]
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
    .map((entry) => {
      const sourceNames = [...entry.sourceNames].sort();
      const trackingModes = [...entry.trackingModes].sort();
      const bodyweightValues = [...entry.bodyweightValues];

      return {
        exerciseId: entry.exerciseId,
        path: `v2-exercises/${entry.exerciseId}`,
        data: {
          displayName: entry.displayName,
          aliases: sourceNames.filter((name) => name !== entry.displayName),
          status: 'active',
          defaultTrackingMode: trackingModes[0] || 'Sets of Reps',
          supportsBodyweight: bodyweightValues.includes(true),
          sourceNames,
          schemaVersion: 2,
          migratedAt,
        },
      };
    });

  return { users: v2Users, workouts: v2Workouts, exercises: v2Exercises };
}

function validateOutputCounts(report) {
  const errors = [];
  if (report.outputCounts.users !== report.sourceCounts.users) {
    errors.push(blocker('user-count-mismatch', `Expected ${report.sourceCounts.users} v2 users, got ${report.outputCounts.users}`));
  }
  if (report.outputCounts.workouts !== report.sourceCounts.workouts) {
    errors.push(blocker('workout-count-mismatch', `Expected ${report.sourceCounts.workouts} v2 workouts, got ${report.outputCounts.workouts}`));
  }
  if (report.outputCounts.exercises !== report.sourceCounts.uniqueExerciseIds) {
    errors.push(blocker('exercise-count-mismatch', `Expected ${report.sourceCounts.uniqueExerciseIds} v2 exercises, got ${report.outputCounts.exercises}`));
  }
  return errors;
}

function blocker(code, message, detail = {}) {
  return { code, message, ...detail };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relative(filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeExerciseType(value) {
  const exerciseType = normalizeName(value) || 'Sets of Reps';
  return exerciseType === 'Sets of Reps with Hold' ? 'Sets of Reps' : exerciseType;
}

function normalizeDefaultFlags(value) {
  const flags = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    equipment: flags.equipment ?? null,
    limbMode: flags.limbMode ?? null,
  };
}

function validateDefaultFlags(value, sourceName) {
  const flags = normalizeDefaultFlags(value);
  const errors = [];

  if (flags.equipment !== null && typeof flags.equipment !== 'string') {
    errors.push(blocker('invalid-default-flag', `Mapping for "${sourceName}" has invalid defaultFlags.equipment`, {
      sourceName,
      field: 'defaultFlags.equipment',
    }));
  }
  if (flags.limbMode !== null && typeof flags.limbMode !== 'string') {
    errors.push(blocker('invalid-default-flag', `Mapping for "${sourceName}" has invalid defaultFlags.limbMode`, {
      sourceName,
      field: 'defaultFlags.limbMode',
    }));
  }

  return errors;
}

function buildUsageFlags(defaultFlags, exercise) {
  const flags = normalizeDefaultFlags(defaultFlags);
  const exerciseType = normalizeName(exercise.exerciseType) || 'Sets of Reps';

  return {
    equipment: flags.equipment,
    limbMode: flags.limbMode,
    hasHoldSeconds:
      exerciseType === 'Sets of Reps with Hold'
        ? nullableNumber(exercise.holdSeconds)
        : null,
  };
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function countMappedExerciseIds(source, mapping) {
  const exerciseIds = new Set();
  for (const sourceName of source.exerciseNames) {
    const mapped = mapping.mappings?.[sourceName];
    if (mapped?.exerciseId) {
      exerciseIds.add(mapped.exerciseId);
    }
  }
  return exerciseIds.size;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function cleanUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}
