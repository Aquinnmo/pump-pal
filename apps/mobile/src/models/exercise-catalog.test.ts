import assert from 'node:assert/strict';
import type { CatalogExercise, ExerciseSearchOption } from '@/types/workout';
import { buildSearchOptions, rankSearchOptions } from './exercise-catalog';

function exercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: 'parent',
    name: 'Parent Exercise',
    normalizedName: 'parent exercise',
    aliases: [],
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    movementPattern: 'press',
    equipment: ['barbell'],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps'],
    variations: [],
    schemaVersion: 2,
    ...overrides,
  };
}

function option(
  label: string,
  overrides: Partial<ExerciseSearchOption> = {},
): ExerciseSearchOption {
  return {
    label,
    exerciseId: label.toLowerCase().replaceAll(' ', '-'),
    variationId: null,
    tokens: label.toLowerCase().split(' '),
    aliases: [],
    primaryMuscles: [],
    equipment: [],
    ...overrides,
  };
}

// Every explicit ranking tier is represented for the same query. The recent
// exact match outranks a plain exact match, followed by prefix, alias,
// token, and finally muscle/equipment matches.
{
  const options = [
    option('Lat Pulldown', { equipment: ['row machine'] }),
    option('Upper Back Pull', { tokens: ['upper', 'rower'], primaryMuscles: ['lats'] }),
    option('Cable Pull', { aliases: ['row'] }),
    option('Row Machine'),
    option('ROW'),
    option('Row'),
  ];

  assert.deepEqual(
    rankSearchOptions(options, 'row', ['Row']).map((entry) => entry.label),
    ['Row', 'ROW', 'Row Machine', 'Cable Pull', 'Upper Back Pull', 'Lat Pulldown'],
    'all six ranking tiers remain ordered from strongest to weakest',
  );
}

// An empty (or whitespace-only) query keeps every option, putting recent
// labels in their recent-list order and sorting the rest alphabetically.
{
  const options = [option('Unlisted'), option('Zed'), option('Beta'), option('Alpha'), option('Another')];
  assert.deepEqual(
    rankSearchOptions(options, '   ', ['Zed', 'Alpha']).map((entry) => entry.label),
    ['Zed', 'Alpha', 'Another', 'Beta', 'Unlisted'],
    'empty queries return all options with recent-first ordering',
  );
}

// Search options include one parent option and one option for every variation;
// variations retain the parent exercise id and carry their own variation id.
{
  const catalog = [exercise({
    id: 'bench',
    name: 'Bench Press',
    aliases: ['bench'],
    variations: [
      { id: 'incline', name: 'Incline', aliases: ['incline bench'], primaryMuscles: ['chest'], secondaryMuscles: [] },
      { id: 'close-grip', name: 'Close Grip', aliases: [], primaryMuscles: ['triceps'], secondaryMuscles: [] },
    ],
  })];

  const options = buildSearchOptions(catalog);
  assert.equal(options.length, 3, 'one parent plus one option per variation');
  assert.deepEqual(options.map(({ label, exerciseId, variationId }) => ({ label, exerciseId, variationId })), [
    { label: 'Bench Press', exerciseId: 'bench', variationId: null },
    { label: 'Incline', exerciseId: 'bench', variationId: 'incline' },
    { label: 'Close Grip', exerciseId: 'bench', variationId: 'close-grip' },
  ]);
}

console.log('exercise-catalog: all assertions passed');
