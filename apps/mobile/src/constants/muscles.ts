export const MUSCLES = [
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
] as const;

export type MuscleId = (typeof MUSCLES)[number];

const MUSCLE_SET = new Set<string>(MUSCLES);

export function isMuscleId(value: string): value is MuscleId {
  return MUSCLE_SET.has(value);
}

export function muscleLabel(id: MuscleId): string {
  return id
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Coarse anatomical regions grouping the 27 canonical muscles.
 * Used by muscle-volume analysis so insights can escalate to a region
 * name ("Shoulders") when an entire region is uniformly over/under-trained.
 */
export const MUSCLE_REGIONS: Record<string, MuscleId[]> = {
  Chest: ['chest'],
  Back: ['upper back', 'lower back', 'lats', 'upper traps', 'mid traps', 'lower traps'],
  Shoulders: ['front delts', 'side delts', 'rear delts', 'rotator cuff'],
  Arms: ['biceps', 'triceps', 'forearm flexors', 'forearm extensors'],
  Core: ['serratus anterior', 'upper abs', 'lower abs', 'obliques'],
  Legs: [
    'quads',
    'hamstrings',
    'glutes',
    'glute medius',
    'adductors',
    'hip flexors',
    'gastrocnemius',
    'soleus',
  ],
};
