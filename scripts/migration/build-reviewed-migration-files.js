const fs = require('node:fs');
const path = require('node:path');

const inventory = JSON.parse(fs.readFileSync(path.join('migration', 'reports', 'legacy-inventory.json'), 'utf8'));
const byName = new Map(inventory.exerciseNames.map((item) => [item.name, item]));

const catalog = [
  exercise('ab-crunch', 'Ab Crunch', ['abs'], [], 'core', 'isolation', ['reps_weight'], [
    variation('machine', 'Machine Ab Crunch', { equipment: 'machine' }),
  ]),
  exercise('back-extension', 'Back Extension', ['lower back', 'glutes', 'hamstrings'], [], 'core', 'compound', ['reps_weight'], [
    variation('45_degree', '45 Degree Back Extension', { equipment: 'bodyweight' }),
  ]),
  exercise('banana-hold', 'Banana Hold', ['abs'], [], 'core', 'static', ['duration'], []),
  exercise('bench-press', 'Bench Press', ['chest'], ['front delts', 'triceps'], 'upper', 'compound', ['reps_weight'], [
    variation('incline', 'Incline Bench Press', { angle: 'incline' }),
  ]),
  exercise('bicep-curl', 'Bicep Curl', ['biceps'], ['forearms'], 'upper', 'isolation', ['reps_weight'], [
    variation('cable', 'Cable Bicep Curl', { equipment: 'cable' }),
    variation('cable_hammer', 'Cable Hammer Curl', { equipment: 'cable', grip: 'neutral' }),
    variation('hammer', 'Hammer Curl', { grip: 'neutral' }),
    variation('machine_preacher', 'Machine Preacher Curl', { equipment: 'machine' }),
  ]),
  exercise('calf-raise', 'Calf Raise', ['calves'], [], 'lower', 'isolation', ['reps_weight'], []),
  exercise('dip', 'Dip', ['chest', 'triceps'], ['front delts'], 'upper', 'compound', ['reps_weight', 'reps_bodyweight'], [
    variation('weighted', 'Weighted Dip', { loadType: 'free_weight' }),
    variation('trap_weighted', 'Weighted Trap Dip', { loadType: 'free_weight' }),
  ]),
  exercise('forearm-curl', 'Forearm Curl', ['forearms'], [], 'upper', 'isolation', ['reps_weight'], [
    variation('barbell', 'Barbell Forearm Curl', { equipment: 'barbell' }),
    variation('barbell_reverse', 'Barbell Reverse Forearm Curl', { equipment: 'barbell', grip: 'reverse' }),
    variation('cable', 'Cable Forearm Curl', { equipment: 'cable' }),
    variation('cable_reverse', 'Reverse Cable Forearm Curl', { equipment: 'cable', grip: 'reverse' }),
    variation('dumbbell', 'Dumbbell Forearm Curl', { equipment: 'dumbbell' }),
    variation('dumbbell_extension', 'Dumbbell Forearm Extension', { equipment: 'dumbbell' }),
    variation('side_dumbbell', 'Side Dumbbell Forearm Curl', { equipment: 'dumbbell' }),
  ]),
  exercise('hack-squat', 'Hack Squat', ['quads'], ['glutes'], 'lower', 'compound', ['reps_weight'], []),
  exercise('hamstring-curl', 'Hamstring Curl', ['hamstrings'], [], 'lower', 'isolation', ['reps_weight'], [
    variation('lying_machine', 'Lying Hamstring Curl', { equipment: 'machine' }),
  ]),
  exercise('hip-abduction', 'Hip Abduction', ['glute medius'], ['glutes'], 'lower', 'isolation', ['reps_weight'], [
    variation('machine', 'Hip Abductor Machine', { equipment: 'machine' }),
  ]),
  exercise('hip-adduction', 'Hip Adduction', ['adductors'], [], 'lower', 'isolation', ['reps_weight'], [
    variation('machine', 'Hip Adductor Machine', { equipment: 'machine' }),
  ]),
  exercise('hip-thrust', 'Hip Thrust', ['glutes'], ['hamstrings'], 'lower', 'compound', ['reps_weight'], [
    variation('barbell', 'Barbell Hip Thrust', { equipment: 'barbell' }),
  ]),
  exercise('lat-pulldown', 'Lat Pulldown', ['lats'], ['biceps', 'upper back'], 'upper', 'compound', ['reps_weight'], [
    variation('single_arm_cable', 'Single Arm Cable Lat Pulldown', { equipment: 'cable', side: 'unilateral' }),
  ]),
  exercise('lateral-raise', 'Lateral Raise', ['side delts'], [], 'upper', 'isolation', ['reps_weight'], [
    variation('cable', 'Cable Lateral Raise', { equipment: 'cable' }),
  ]),
  exercise('leg-extension', 'Leg Extension', ['quads'], [], 'lower', 'isolation', ['reps_weight'], [
    variation('single_leg', 'Single-Leg Leg Extension', { equipment: 'machine', side: 'unilateral' }),
  ]),
  exercise('leg-press', 'Leg Press', ['quads'], ['glutes', 'hamstrings'], 'lower', 'compound', ['reps_weight'], []),
  exercise('leg-raise', 'Leg Raise', ['abs', 'hip flexors'], [], 'core', 'isolation', ['reps_bodyweight', 'duration'], [
    variation('hold', 'Leg Raise Hold', { mechanics: 'static' }),
  ]),
  exercise('l-sit', 'L-Sit', ['abs', 'hip flexors'], ['triceps'], 'core', 'static', ['duration'], [
    variation('hanging', 'Hanging L-Sit', { loadType: 'bodyweight' }),
  ]),
  exercise('muscle-up', 'Muscle Up', ['lats', 'chest'], ['biceps', 'triceps'], 'upper', 'compound', ['reps_bodyweight'], []),
  exercise('overhead-press', 'Overhead Press', ['shoulders'], ['triceps'], 'upper', 'compound', ['reps_weight'], [
    variation('arnold_dumbbell', 'Arnold Press', { equipment: 'dumbbell' }),
    variation('machine', 'Machine Overhead Shoulder Press', { equipment: 'machine' }),
  ]),
  exercise('pec-fly', 'Pec Fly', ['chest'], ['front delts'], 'upper', 'isolation', ['reps_weight'], [
    variation('upward_cable', 'Upward Cable Pec Fly', { equipment: 'cable', angle: 'upward' }),
  ]),
  exercise('pendulum-squat', 'Pendulum Squat', ['quads'], ['glutes'], 'lower', 'compound', ['reps_weight'], []),
  exercise('pull-up', 'Pull-Up', ['lats'], ['biceps', 'upper back'], 'upper', 'compound', ['reps_weight', 'reps_bodyweight'], [
    variation('weighted', 'Weighted Pull-Up', { loadType: 'free_weight' }),
  ]),
  exercise('push-up', 'Push-Up', ['chest'], ['triceps', 'front delts'], 'upper', 'compound', ['reps_bodyweight'], [
    variation('one_arm', 'One-Arm Push-Up', { side: 'unilateral' }),
    variation('pseudo_planche', 'Pseudo Planche Push-Up', {}),
  ]),
  exercise('rear-delt-fly', 'Rear Delt Fly', ['rear delts'], ['upper back'], 'upper', 'isolation', ['reps_weight'], []),
  exercise('roman-chair-hold', 'Roman Chair Hold', ['abs'], ['hip flexors'], 'core', 'static', ['duration'], []),
  exercise('romanian-deadlift', 'Romanian Deadlift', ['hamstrings', 'glutes'], ['lower back'], 'lower', 'compound', ['reps_weight'], [
    variation('single_leg', 'Single-Leg Romanian Deadlift', { side: 'unilateral' }),
  ]),
  exercise('row', 'Row', ['upper back', 'lats'], ['biceps', 'rear delts'], 'upper', 'compound', ['reps_weight'], [
    variation('cable', 'Cable Row', { equipment: 'cable' }),
    variation('chest_supported', 'Chest Supported Row', {}),
    variation('dumbbell_bent_over', 'Dumbbell Bent Over Row', { equipment: 'dumbbell' }),
    variation('seated_lateral', 'Seated Lateral Row', {}),
  ]),
  exercise('squat', 'Squat', ['quads', 'glutes'], ['hamstrings'], 'lower', 'compound', ['reps_weight'], [
    variation('barbell_back', 'Barbell Back Squat', { equipment: 'barbell' }),
    variation('goblet', 'Goblet Squat', { equipment: 'dumbbell' }),
  ]),
  exercise('straight-arm-pulldown', 'Straight Arm Pulldown', ['lats'], ['triceps'], 'upper', 'isolation', ['reps_weight'], []),
  exercise('test-exercise', 'Test Exercise', [], [], 'full_body', 'mixed', ['reps_weight', 'reps_bodyweight', 'duration'], []),
  exercise('triceps-extension', 'Triceps Extension', ['triceps'], [], 'upper', 'isolation', ['reps_weight'], [
    variation('overhead', 'Overhead Triceps Extension', {}),
    variation('cable_pushdown', 'Cable Triceps Pushdown', { equipment: 'cable' }),
    variation('single_arm_cable_pushdown', 'Single Arm Cable Triceps Pushdown', { equipment: 'cable', side: 'unilateral' }),
  ]),
  exercise('trunk-rotation', 'Trunk Rotation', ['obliques'], ['abs'], 'core', 'isolation', ['reps_weight'], [
    variation('cable', 'Cable Trunk Rotation', { equipment: 'cable' }),
  ]),
];

const decisions = {
  '45 Degree Back Extension': map('back-extension', '45_degree'),
  'Ab Bench Machine': map('ab-crunch', 'machine'),
  'Arnold Press': map('overhead-press', 'arnold_dumbbell'),
  'Banana Holds': map('banana-hold', null),
  'Barbell Back Squat': map('squat', 'barbell_back'),
  'Barbell Forearm Curls': map('forearm-curl', 'barbell'),
  'Barbell Hip Thrusts': map('hip-thrust', 'barbell'),
  'Barbell Reverse Forearm Curl': map('forearm-curl', 'barbell_reverse'),
  'Bench Press': map('bench-press', null),
  'Bicep Curls': map('bicep-curl', null),
  'Cable Bicep Curls': map('bicep-curl', 'cable'),
  'Cable curls': map('bicep-curl', 'cable'),
  'Cable Forearm Curls': map('forearm-curl', 'cable'),
  'Cable Hammer Curls': map('bicep-curl', 'cable_hammer'),
  'Cable Lat Raises': map('lateral-raise', 'cable'),
  'Cable rows': map('row', 'cable'),
  'Cable Trunk Rotations': map('trunk-rotation', 'cable'),
  'Calf Raises': map('calf-raise', null),
  'Calf Raises (Standing)': map('calf-raise', null),
  'Chest Supported Rows': map('row', 'chest_supported'),
  'Dgsh': map('test-exercise', null),
  'Dips': map('dip', 'weighted'),
  'Dumbbell Bent Over Rows': map('row', 'dumbbell_bent_over'),
  'Dumbbell Forearm Curls': map('forearm-curl', 'dumbbell'),
  'Dumbbell Forearm Extensions': map('forearm-curl', 'dumbbell_extension'),
  'Goblet Squat': map('squat', 'goblet'),
  'Hack Squat': map('hack-squat', null),
  'Hammer Curls': map('bicep-curl', 'hammer'),
  'Hanging L Sits': map('l-sit', 'hanging'),
  'Hip Abductor Machine': map('hip-abduction', 'machine'),
  'Hip Adductor Machine': map('hip-adduction', 'machine'),
  'Hwhegvs': map('test-exercise', null),
  'Incline Bench Press': map('bench-press', 'incline'),
  'Lat pull downs': map('lat-pulldown', null),
  'Lateral Raises': map('lateral-raise', null),
  'Leg Extensions': map('leg-extension', null),
  'Leg Press': map('leg-press', null),
  'Leg Raise Holds': map('leg-raise', 'hold'),
  'Leg Raises': map('leg-raise', null),
  'Lying Hamstring Curls': map('hamstring-curl', 'lying_machine'),
  'Machine Overhead Shoulder Press': map('overhead-press', 'machine'),
  'Machine Preacher Curls': map('bicep-curl', 'machine_preacher'),
  'Muscle Ups': map('muscle-up', null),
  'Nshevev': map('test-exercise', null),
  'One-Arm Pushup': map('push-up', 'one_arm'),
  'Overhead Shoulder Press': map('overhead-press', null),
  'Overhead Tricep': map('triceps-extension', 'overhead'),
  'Overhead Tricep Extensions': map('triceps-extension', 'overhead'),
  'Pec Flies': map('pec-fly', null),
  'Pec Fly': map('pec-fly', null),
  'Pendulum Squats': map('pendulum-squat', null),
  'Pseudo Planche Pushup': map('push-up', 'pseudo_planche'),
  'Pull Ups': map('pull-up', 'weighted'),
  'Rear Delt Flies': map('rear-delt-fly', null),
  'Reverse Cable Forearm Curls': map('forearm-curl', 'cable_reverse'),
  'Roman Chair Holds': map('roman-chair-hold', null),
  'Romanian Deadlift': map('romanian-deadlift', null),
  'Seated Curls': map('bicep-curl', null),
  'Seated Lateral Rows': map('row', 'seated_lateral'),
  'Side Dumbbell Forearm Curls': map('forearm-curl', 'side_dumbbell'),
  'Single Arm Cable Tricep Pushdowns': map('triceps-extension', 'single_arm_cable_pushdown'),
  'Single Arm Lat Pulldowns': map('lat-pulldown', 'single_arm_cable'),
  'Single-Leg Leg Extension': map('leg-extension', 'single_leg'),
  'Single-Leg RDLs': map('romanian-deadlift', 'single_leg'),
  'Straight Arm Pulldowns': map('straight-arm-pulldown', null),
  'Straight Arm Pushdowns': map('straight-arm-pulldown', null),
  'Trap Dips': map('dip', 'trap_weighted'),
  'Tricep Push Down': map('triceps-extension', 'cable_pushdown'),
  'Upwards Cable Pec Flies': map('pec-fly', 'upward_cable'),
};

function map(exerciseId, variationId) {
  return { exerciseId, variationId };
}

function exercise(id, name, primaryMuscles, secondaryMuscles, bodyRegion, mechanics, trackingModes, variations) {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    primaryMuscles,
    secondaryMuscles,
    movementPattern: '',
    equipment: Array.from(new Set(variations.map((item) => item.equipment).filter(Boolean))),
    bodyRegion,
    mechanics,
    forceType: 'mixed',
    trackingModes,
    variations,
  };
}

function variation(id, name, extra = {}) {
  return {
    id,
    name,
    aliases: [],
    ...extra,
  };
}

function findExercise(id) {
  const item = catalog.find((exercise) => exercise.id === id);
  if (!item) throw new Error(`Missing catalog exercise ${id}`);
  return item;
}

function findVariation(exercise, variationId) {
  if (variationId === null) return null;
  const item = exercise.variations.find((variationItem) => variationItem.id === variationId);
  if (!item) throw new Error(`Missing variation ${exercise.id}/${variationId}`);
  return item;
}

const mapping = {
  schemaVersion: 1,
  notes: [
    'Reviewed mapping generated after user markup in migration/mapping-review.md.',
    'All legacy names are approved for dry-run conversion.',
    'test-exercise entries preserve historical rows and are planned for later deletion from production history.',
  ],
  mappings: Array.from(byName.keys()).sort((a, b) => a.localeCompare(b)).map((legacyName) => {
    const decision = decisions[legacyName];
    if (!decision) throw new Error(`Missing decision for ${legacyName}`);
    const exerciseItem = findExercise(decision.exerciseId);
    const variationItem = findVariation(exerciseItem, decision.variationId);
    const inventoryItem = byName.get(legacyName);
    return {
      legacyName,
      exerciseId: exerciseItem.id,
      exerciseNameSnapshot: exerciseItem.name,
      variationId: variationItem ? variationItem.id : null,
      variationNameSnapshot: variationItem ? variationItem.name : null,
      status: 'approved',
      occurrenceCount: inventoryItem.count,
      samplePaths: inventoryItem.samplePaths,
      reviewNotes: legacyName === 'Dgsh' || legacyName === 'Hwhegvs' || legacyName === 'Nshevev'
        ? 'Mapped to test-exercise per review; preserve now, delete later.'
        : '',
    };
  }),
};

const catalogSeed = {
  schemaVersion: 2,
  exercises: catalog,
};

fs.writeFileSync(path.join('migration', 'exercise-mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`);
fs.writeFileSync(path.join('migration', 'catalog-seed.json'), `${JSON.stringify(catalogSeed, null, 2)}\n`);

console.log(`Wrote ${mapping.mappings.length} approved mappings`);
console.log(`Wrote ${catalog.length} catalog exercises`);
