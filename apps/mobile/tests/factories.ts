import type { CatalogExercise, DraftExerciseRow, DraftSet, PerformedExercise, Workout } from '@/types/workout';
import type { Injury, UserDoc } from '@/types/user';

const timestamp = (): Date => new Date('2025-01-01T00:00:00.000Z');

const defaultSet = (): DraftSet => ({
  reps: 8,
  weight: '20',
  durationMinutes: 0,
  durationSeconds: 0,
});

export function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    userId: 'user-1',
    name: 'Push Day',
    performedExercises: [makePerformedExercise()],
    schemaVersion: 2,
    date: timestamp(),
    ...overrides,
  };
}

export function makePerformedExercise(overrides: Partial<PerformedExercise> = {}): PerformedExercise {
  return {
    order: 0,
    exerciseId: 'bench-press',
    exerciseRefPath: 'exercises/bench-press',
    exerciseNameSnapshot: 'Bench Press',
    variationId: null,
    variationNameSnapshot: null,
    sets: [{ setNumber: 1, reps: 8, weight: 20, completed: true }],
    ...overrides,
  };
}

export function makeDraftExerciseRow(overrides: Partial<DraftExerciseRow> = {}): DraftExerciseRow {
  return {
    uid: 'draft-1',
    exerciseId: 'bench-press',
    variationId: null,
    label: 'Bench Press',
    exerciseType: 'Sets of Reps',
    bodyweight: false,
    sets: [defaultSet()],
    ...overrides,
  };
}

export function makeCatalogExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: 'bench-press',
    name: 'Bench Press',
    normalizedName: 'bench press',
    aliases: [],
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front delts'],
    movementPattern: 'horizontal push',
    equipment: ['barbell'],
    bodyRegion: 'upper',
    mechanics: 'compound',
    forceType: 'push',
    trackingModes: ['reps'],
    variations: [],
    schemaVersion: 2,
    status: 'approved',
    ...overrides,
  };
}

export function makeInjury(overrides: Partial<Injury> = {}): Injury {
  return {
    id: 'injury-1',
    bodyPart: 'shoulder',
    side: 'left',
    muscles: ['front delts'],
    severity: 'mild',
    status: 'ongoing',
    onsetDate: timestamp(),
    resolvedDate: null,
    avoid: [],
    notes: '',
    createdAt: timestamp(),
    updatedAt: timestamp(),
    ...overrides,
  };
}

export function makeUserDoc(overrides: Partial<UserDoc> = {}): UserDoc {
  return {
    workoutSplit: {
      type: 'Push / Pull / Legs',
      custom: null,
      updatedAt: timestamp(),
    },
    username: 'test-user',
    usernameLower: 'test-user',
    injuries: [],
    aiEnabled: false,
    socialEnabled: true,
    ...overrides,
  };
}
