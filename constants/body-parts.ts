import { MuscleId } from './muscles';

/**
 * Body-part taxonomy for injuries. Chosen to read naturally for a user
 * describing an injury (joints/regions, not individual muscles), while still
 * joining the canonical muscle model via BODY_PART_MUSCLES below.
 */
export const BODY_PARTS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'hand',
  'upper back',
  'lower back',
  'chest',
  'abdomen',
  'hip',
  'groin',
  'knee',
  'ankle',
  'foot',
] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

/**
 * Maps each body part to the canonical muscles it plausibly affects, so injury
 * data joins the muscle-volume engine (utils/muscle-analysis.ts) and future AI
 * prompts can reason about which muscles to protect. Coarse by design — an
 * injury also carries an optional precise `muscles` list for finer control.
 */
export const BODY_PART_MUSCLES: Record<BodyPart, MuscleId[]> = {
  neck: ['upper traps'],
  shoulder: ['front delts', 'side delts', 'rear delts', 'rotator cuff'],
  elbow: ['biceps', 'triceps', 'forearm flexors', 'forearm extensors'],
  wrist: ['forearm flexors', 'forearm extensors'],
  hand: ['forearm flexors', 'forearm extensors'],
  'upper back': ['upper back', 'lats', 'upper traps', 'mid traps', 'lower traps'],
  'lower back': ['lower back'],
  chest: ['chest'],
  abdomen: ['upper abs', 'lower abs', 'obliques', 'serratus anterior'],
  hip: ['hip flexors', 'glutes', 'glute medius', 'adductors'],
  groin: ['adductors', 'hip flexors'],
  knee: ['quads', 'hamstrings'],
  ankle: ['gastrocnemius', 'soleus'],
  foot: ['gastrocnemius', 'soleus'],
};

const BODY_PART_SET = new Set<string>(BODY_PARTS);

export function isBodyPart(value: unknown): value is BodyPart {
  return typeof value === 'string' && BODY_PART_SET.has(value);
}

export function bodyPartLabel(id: BodyPart): string {
  return id
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
