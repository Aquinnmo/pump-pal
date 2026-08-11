import { catalogRepository } from '@/data/catalog-repository';
import { CatalogExercise, ExerciseRef } from '@/types/workout';
import { slugify } from './exercise-catalog';

export async function createPendingExercise(name: string, uid: string): Promise<ExerciseRef> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Exercise name is required');

  const id = `pending-${slugify(trimmed)}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const pendingExercise: CatalogExercise = {
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
    createdAt: now as CatalogExercise['createdAt'],
    updatedAt: now as CatalogExercise['updatedAt'],
  };

  await catalogRepository.createPending(uid, pendingExercise);

  return { exerciseId: id, variationId: null, label: trimmed };
}
