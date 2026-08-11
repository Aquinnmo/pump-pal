// Mirrors constants/muscles.ts MUSCLES. CommonJS scripts can't import the TS
// module directly, so this list is kept in sync via a guard test
// (canonical-muscles.test.js) that diffs it against the TS source.
const MUSCLE_IDS = [
  'chest',
  'upper back',
  'lower back',
  'lats',
  'upper traps',
  'mid traps',
  'lower traps',
  'front delts',
  'side delts',
  'rear delts',
  'rotator cuff',
  'biceps',
  'triceps',
  'forearm flexors',
  'forearm extensors',
  'serratus anterior',
  'upper abs',
  'lower abs',
  'obliques',
  'quads',
  'hamstrings',
  'glutes',
  'glute medius',
  'adductors',
  'hip flexors',
  'gastrocnemius',
  'soleus',
];

module.exports = { MUSCLE_IDS };
