import { db } from '@/config/firebase';
import { CatalogExercise, ExerciseRef } from '@/types/workout';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { slugify } from './exercise-catalog';

const MAX_SUFFIX_ATTEMPTS = 10;

async function reserveExerciseId(baseId: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SUFFIX_ATTEMPTS; attempt += 1) {
    const candidateId = attempt === 1 ? baseId : `${baseId}-${attempt}`;
    const snap = await getDoc(doc(db, 'exercises', candidateId));
    if (!snap.exists()) return candidateId;
  }
  throw new Error(`Could not reserve an exercise id for ${baseId}`);
}

export async function createPendingExercise(name: string, uid: string): Promise<ExerciseRef> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Exercise name is required');

  const baseId = `pending-${slugify(trimmed)}`;
  const id = await reserveExerciseId(baseId);

  const pendingExercise: Omit<CatalogExercise, 'updatedAt' | 'createdAt'> & {
    createdBy: string;
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    id,
    name: trimmed,
    normalizedName: trimmed.toLowerCase(),
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: '',
    equipment: [],
    bodyRegion: 'full_body',
    mechanics: 'compound',
    forceType: 'mixed',
    trackingModes: ['reps_weight'] as unknown as CatalogExercise['trackingModes'],
    variations: [],
    schemaVersion: 2,
    status: 'pending_review',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'exercises', id), pendingExercise);

  return { exerciseId: id, variationId: null, label: trimmed };
}
