const fs = require('node:fs');

function validateMapping({ catalog, mapping }) {
  const errors = [];
  const exerciseById = new Map((catalog.exercises || []).map((exercise) => [exercise.id, exercise]));

  (mapping.mappings || []).forEach((entry, index) => {
    const prefix = `mappings[${index}] ${entry.legacyName || '(missing legacyName)'}`;

    if (entry.status !== 'approved') {
      errors.push(`${prefix}: status must be approved before workout migration`);
      return;
    }

    const exercise = exerciseById.get(entry.exerciseId);
    if (!exercise) {
      errors.push(`${prefix}: exerciseId ${entry.exerciseId} missing from catalog`);
      return;
    }

    if (entry.variationId !== null && entry.variationId !== undefined) {
      const variation = (exercise.variations || []).find((item) => item.id === entry.variationId);
      if (!variation) {
        errors.push(`${prefix}: variationId ${entry.variationId} missing from ${entry.exerciseId}`);
      }
    }
  });

  return errors;
}

function run(argv) {
  const catalogPath = argv[2];
  const mappingPath = argv[3];

  if (!catalogPath || !mappingPath) {
    console.error('Usage: node scripts/migration/validate-mapping.js <catalog-seed.json> <exercise-mapping.json>');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  const errors = validateMapping({ catalog, mapping });

  if (errors.length > 0) {
    errors.forEach((error) => console.error(error));
    process.exit(1);
  }

  console.log(`Mapping valid: ${mapping.mappings.length} approved entries`);
}

if (require.main === module) run(process.argv);

module.exports = {
  validateMapping,
};

