#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXPORT_FILE = path.join(ROOT, 'temp', 'firestore-workouts-export.json');
const INVENTORY_JSON = path.join(ROOT, 'temp', 'exercise-name-inventory.json');
const INVENTORY_CSV = path.join(ROOT, 'temp', 'exercise-name-inventory.csv');
const REPORT_JSON = path.join(ROOT, 'temp', 'phase-1-validation-report.json');
const MAPPING_FILE = path.join(ROOT, 'migration', 'exercise-name-map.json');

main();

function main() {
  const exportData = readJson(EXPORT_FILE);
  const inventory = buildInventory(exportData);
  const existingMap = fs.existsSync(MAPPING_FILE) ? readJson(MAPPING_FILE) : null;
  const mapping = buildMapping(exportData, inventory, existingMap);
  const report = validateMapping(inventory, mapping);
  const reviewWarnings = buildReviewWarnings(inventory, mapping);

  fs.mkdirSync(path.dirname(INVENTORY_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(MAPPING_FILE), { recursive: true });

  writeJson(INVENTORY_JSON, {
    sourceExport: relative(EXPORT_FILE),
    sourceExportedAt: exportData.exportedAt || null,
    userCount: exportData.userCount || 0,
    workoutCount: exportData.workoutCount || 0,
    uniqueExerciseNameCount: inventory.length,
    exercises: inventory,
  });
  fs.writeFileSync(INVENTORY_CSV, `${toCsv(inventory)}\n`);
  writeJson(MAPPING_FILE, mapping);
  writeJson(REPORT_JSON, {
    sourceExport: relative(EXPORT_FILE),
    sourceExportedAt: exportData.exportedAt || null,
    checkpoint: {
      inventoryCount: inventory.length,
      mappingCount: Object.keys(mapping.mappings || {}).length,
      missingMappings: report.missingMappings,
      invalidMappings: report.invalidMappings,
      duplicateExerciseIds: report.duplicateExerciseIds,
      passed: report.errors.length === 0,
    },
    reviewWarnings,
    errors: report.errors,
  });

  console.log(`Inventory: ${inventory.length} unique exercise names`);
  console.log(`Source: ${exportData.userCount || 0} users, ${exportData.workoutCount || 0} workouts`);
  console.log(`Wrote ${relative(INVENTORY_JSON)}`);
  console.log(`Wrote ${relative(INVENTORY_CSV)}`);
  console.log(`Wrote ${relative(MAPPING_FILE)}`);
  console.log(`Wrote ${relative(REPORT_JSON)}`);

  if (report.errors.length > 0) {
    console.error('\nPhase 1 validation failed:');
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Phase 1 validation passed: every exercise name has one mapping and no generated slug conflicts were found.');
  if (report.needsReviewCount > 0) {
    console.log(`${report.needsReviewCount} mappings are marked "needs-review" for manual approval before a write migration.`);
  }
  if (reviewWarnings.unknownExerciseTypes.length > 0 || reviewWarnings.mixedBodyweight.length > 0) {
    console.log('Review warnings were captured in temp/phase-1-validation-report.json.');
  }
}

function buildInventory(exportData) {
  const byName = new Map();

  for (const user of exportData.users || []) {
    for (const workout of user.workouts || []) {
      const workoutData = workout.data || {};
      const exercises = Array.isArray(workoutData.exercises) ? workoutData.exercises : [];

      exercises.forEach((exercise, index) => {
        const name = normalizeName(exercise.name);
        if (!name) return;

        if (!byName.has(name)) {
          byName.set(name, {
            name,
            suggestedExerciseId: slugify(name),
            occurrenceCount: 0,
            workoutIds: new Set(),
            userIds: new Set(),
            exerciseTypeCounts: new Map(),
            bodyweightCounts: new Map(),
            workoutNameCounts: new Map(),
            maxWeightLbs: null,
            maxReps: null,
            maxDurationSeconds: null,
            examples: [],
          });
        }

        const entry = byName.get(name);
        const exerciseType = normalizeName(exercise.exerciseType) || 'Sets of Reps';
        const bodyweight = Boolean(exercise.bodyweight);
        const workoutId = workout.workoutId || documentIdFromPath(workout.path) || '<unknown-workout>';
        const userId = user.userId || '<unknown-user>';
        const workoutName = normalizeName(workoutData.name) || '<unnamed-workout>';
        const weight = Number(exercise.weight);
        const reps = Number(exercise.reps);
        const durationSeconds =
          Number(exercise.durationMinutes || 0) * 60 + Number(exercise.durationSeconds || 0);

        entry.occurrenceCount += 1;
        entry.workoutIds.add(workoutId);
        entry.userIds.add(userId);
        increment(entry.exerciseTypeCounts, exerciseType);
        increment(entry.bodyweightCounts, String(bodyweight));
        increment(entry.workoutNameCounts, workoutName);

        if (Number.isFinite(weight)) {
          entry.maxWeightLbs = entry.maxWeightLbs === null ? weight : Math.max(entry.maxWeightLbs, weight);
        }
        if (Number.isFinite(reps)) {
          entry.maxReps = entry.maxReps === null ? reps : Math.max(entry.maxReps, reps);
        }
        if (durationSeconds > 0) {
          entry.maxDurationSeconds =
            entry.maxDurationSeconds === null ? durationSeconds : Math.max(entry.maxDurationSeconds, durationSeconds);
        }

        if (entry.examples.length < 5) {
          entry.examples.push({
            userId,
            workoutId,
            workoutPath: workout.path || `users/${userId}/workouts/${workoutId}`,
            workoutName,
            exerciseIndex: index,
            exerciseType,
            bodyweight,
          });
        }
      });
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      suggestedExerciseId: entry.suggestedExerciseId,
      occurrenceCount: entry.occurrenceCount,
      workoutCount: entry.workoutIds.size,
      userCount: entry.userIds.size,
      exerciseTypes: mapToSortedObject(entry.exerciseTypeCounts),
      bodyweight: mapToSortedObject(entry.bodyweightCounts),
      workoutNames: mapToSortedObject(entry.workoutNameCounts),
      maxWeightLbs: entry.maxWeightLbs,
      maxReps: entry.maxReps,
      maxDurationSeconds: entry.maxDurationSeconds,
      examples: entry.examples,
    }));
}

function buildMapping(exportData, inventory, existingMap) {
  const existingMappings = existingMap?.mappings || {};
  const mappings = {};

  for (const item of inventory) {
    const existing = existingMappings[item.name] || {};
    mappings[item.name] = {
      exerciseId: existing.exerciseId || item.suggestedExerciseId,
      displayName: existing.displayName || item.name,
      defaultFlags: normalizeDefaultFlags(existing.defaultFlags),
      reviewStatus: existing.reviewStatus || 'needs-review',
      sourceCount: item.occurrenceCount,
      sourceWorkoutCount: item.workoutCount,
      sourceUserCount: item.userCount,
      notes: existing.notes || '',
    };
  }

  return {
    schemaVersion: 1,
    sourceExport: relative(EXPORT_FILE),
    sourceExportedAt: exportData.exportedAt || null,
    purpose:
      'Manual mapping from historical exercise display names to stable exercise catalog IDs and default per-usage flags. Edit exerciseId/displayName/defaultFlags/reviewStatus before running later migration phases.',
    reviewStatusValues: ['needs-review', 'approved', 'rejected'],
    mappings,
  };
}

function validateMapping(inventory, mapping) {
  const errors = [];
  const missingMappings = [];
  const invalidMappings = [];
  const mappings = mapping.mappings || {};
  const expectedNames = new Set(inventory.map((entry) => entry.name));
  let needsReviewCount = 0;

  for (const item of inventory) {
    const mapped = mappings[item.name];
    if (!mapped) {
      missingMappings.push(item.name);
      errors.push(`Missing mapping for "${item.name}"`);
      continue;
    }

    if (!mapped.exerciseId || typeof mapped.exerciseId !== 'string') {
      invalidMappings.push(item.name);
      errors.push(`Mapping for "${item.name}" has no exerciseId`);
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapped.exerciseId)) {
      invalidMappings.push(item.name);
      errors.push(`Mapping for "${item.name}" has invalid slug "${mapped.exerciseId}"`);
    }

    if (!mapped.displayName || typeof mapped.displayName !== 'string') {
      invalidMappings.push(item.name);
      errors.push(`Mapping for "${item.name}" has no displayName`);
    }

    const flagErrors = validateDefaultFlags(mapped.defaultFlags, item.name);
    if (flagErrors.length > 0) {
      invalidMappings.push(item.name);
      errors.push(...flagErrors);
    }

    if (mapped.reviewStatus === 'needs-review') {
      needsReviewCount += 1;
    }
  }

  for (const extraName of Object.keys(mappings)) {
    if (!expectedNames.has(extraName)) {
      errors.push(`Mapping includes stale source name "${extraName}" that is not present in the export`);
    }
  }

  return { errors, needsReviewCount, missingMappings, invalidMappings, duplicateExerciseIds: [] };
}

function buildReviewWarnings(inventory, mapping) {
  const supportedExerciseTypes = new Set(['Sets of Reps', 'Sets of Duration', 'Sets of Reps with Hold']);
  const unknownExerciseTypesByName = new Map();
  const mixedExerciseTypes = [];
  const mixedBodyweight = [];

  for (const item of inventory) {
    const exerciseTypes = Object.keys(item.exerciseTypes);
    const bodyweightValues = Object.keys(item.bodyweight);

    if (exerciseTypes.length > 1) {
      mixedExerciseTypes.push({
        name: item.name,
        suggestedExerciseId: item.suggestedExerciseId,
        exerciseTypes: item.exerciseTypes,
      });
    }

    if (bodyweightValues.length > 1) {
      mixedBodyweight.push({
        name: item.name,
        suggestedExerciseId: item.suggestedExerciseId,
        bodyweight: item.bodyweight,
      });
    }

    for (const exerciseType of exerciseTypes) {
      if (!supportedExerciseTypes.has(exerciseType)) {
        if (!unknownExerciseTypesByName.has(exerciseType)) {
          unknownExerciseTypesByName.set(exerciseType, []);
        }
        unknownExerciseTypesByName.get(exerciseType).push(item.name);
      }
    }
  }

  return {
    needsReviewCount: Object.values(mapping.mappings || {}).filter((entry) => entry.reviewStatus === 'needs-review').length,
    unknownExerciseTypes: [...unknownExerciseTypesByName.entries()].map(([exerciseType, names]) => ({
      exerciseType,
      names: names.sort(),
    })),
    mixedExerciseTypes: mixedExerciseTypes.sort((a, b) => a.name.localeCompare(b.name)),
    mixedBodyweight: mixedBodyweight.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function toCsv(inventory) {
  const header = [
    'name',
    'suggestedExerciseId',
    'occurrenceCount',
    'workoutCount',
    'userCount',
    'exerciseTypes',
    'bodyweight',
    'topWorkoutNames',
    'maxWeightLbs',
    'maxReps',
    'maxDurationSeconds',
  ];
  const rows = inventory.map((item) => [
    item.name,
    item.suggestedExerciseId,
    item.occurrenceCount,
    item.workoutCount,
    item.userCount,
    compactCounts(item.exerciseTypes),
    compactCounts(item.bodyweight),
    compactCounts(item.workoutNames),
    item.maxWeightLbs ?? '',
    item.maxReps ?? '',
    item.maxDurationSeconds ?? '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
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

function slugify(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function compactCounts(value) {
  return Object.entries(value)
    .map(([key, count]) => `${key}:${count}`)
    .join('; ');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeDefaultFlags(value) {
  const flags = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    equipment: flags.equipment ?? null,
    limbMode: flags.limbMode ?? null,
  };
}

function validateDefaultFlags(value, sourceName) {
  const errors = [];
  const flags = normalizeDefaultFlags(value);

  if (flags.equipment !== null && typeof flags.equipment !== 'string') {
    errors.push(`Mapping for "${sourceName}" has invalid defaultFlags.equipment; expected string or null`);
  }
  if (flags.limbMode !== null && typeof flags.limbMode !== 'string') {
    errors.push(`Mapping for "${sourceName}" has invalid defaultFlags.limbMode; expected string or null`);
  }

  return errors;
}

function documentIdFromPath(value) {
  if (!value) return '';
  return String(value).slice(String(value).lastIndexOf('/') + 1);
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}
