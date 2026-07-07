const fs = require('node:fs');
const path = require('node:path');

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function guessExerciseId(legacyName) {
  return slugify(
    legacyName
      .replace(/\bdb\b/gi, 'dumbbell')
      .replace(/\bbb\b/gi, 'barbell')
  );
}

function generateMappingDraft(inventory) {
  return {
    schemaVersion: 1,
    notes: [
      'Generated from legacy workout inventory.',
      'Review every entry before writing workouts.',
      'Set status to approved only after exerciseId and variationId are correct.',
      'Use variationId null when variation is unknown.',
    ],
    mappings: inventory.exerciseNames.map((item) => ({
      legacyName: item.name,
      exerciseId: guessExerciseId(item.name),
      exerciseNameSnapshot: item.name,
      variationId: null,
      variationNameSnapshot: null,
      status: 'needs_review',
      occurrenceCount: item.count,
      samplePaths: item.samplePaths,
      reviewNotes: '',
    })),
  };
}

function run(argv) {
  const inventoryPath = argv[2] || path.join('migration', 'reports', 'legacy-inventory.json');
  const outputPath = argv[3] || path.join('migration', 'exercise-mapping.generated.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const draft = generateMappingDraft(inventory);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(draft, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Review ${draft.mappings.length} mappings before migration`);
}

if (require.main === module) run(process.argv);

module.exports = {
  generateMappingDraft,
  guessExerciseId,
};

