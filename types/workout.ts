import { Timestamp } from 'firebase/firestore';
import { MuscleId } from '@/constants/muscles';

export type TrackingMode = 'reps' | 'duration' | 'distance' | 'calories';

export type PerformedSet = {
  setNumber: number;
  reps?: number;
  weight?: number;
  bodyweight?: boolean;
  durationSeconds?: number;
  holdSeconds?: number;
  distance?: number;
  calories?: number;
  rpe?: number;
  notes?: string;
  completed?: boolean;
};

export type PerformedExercise = {
  order: number;
  exerciseId: string;
  exerciseRefPath: string;
  exerciseNameSnapshot: string;
  variationId: string | null;
  variationNameSnapshot: string | null;
  sets: PerformedSet[];
  notes?: string;
  legacy?: Record<string, unknown>;
};

export type MigrationSource = {
  type: 'legacy_user_subcollection';
  path: string;
  oldWorkoutId: string;
};

// status is absent on all legacy/completed docs prior to this feature —
// treat missing status as 'completed'. planned/in_progress docs omit `date`
// entirely so every existing orderBy('date') query excludes them for free.
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed';

export type Workout = {
  id: string;
  userId: string;
  name: string;
  date: { seconds: number; nanoseconds: number } | Date | Timestamp;
  notes?: string;
  performedExercises: PerformedExercise[];
  schemaVersion: 2;
  source?: MigrationSource;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  status?: WorkoutStatus;
  queueOrder?: number;
  startedAt?: Timestamp;
  // Ids of the user's injuries that were ongoing when this workout was logged
  // (auto-attached on completion). Analytics/AI join these back to users/{uid}.injuries.
  injuries?: string[];
};

export type ExerciseVariation = {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  equipment?: string;
  angle?: string;
  grip?: string;
  stance?: string;
  side?: string;
  loadType?: string;
  mechanics?: string;
};

export type CatalogExercise = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  movementPattern: string;
  equipment: string[];
  bodyRegion: 'upper' | 'lower' | 'core' | 'full_body';
  mechanics: 'compound' | 'isolation' | 'static' | 'cardio';
  forceType: 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'rotation' | 'static' | 'mixed';
  trackingModes: TrackingMode[];
  variations: ExerciseVariation[];
  schemaVersion: 2;
  status?: 'approved' | 'pending_review';
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ExerciseCatalogMeta = {
  version: number;
  exerciseCount: number;
  schemaVersion: 2;
  updatedAt?: Timestamp;
};

export type ExerciseSearchOption = {
  label: string;
  exerciseId: string;
  variationId: string | null;
  tokens: string[];
  aliases: string[];
  primaryMuscles: MuscleId[];
  equipment: string[];
};

export type ExerciseRef = { exerciseId: string; variationId: string | null; label: string };
export type RecentExercise = ExerciseRef;

export type ExerciseType = 'Sets of Reps' | 'Sets of Duration';

export type DraftSet = {
  reps: number;
  weight: string;
  durationMinutes: number;
  durationSeconds: number;
  completed?: boolean;
};

// Modal's per-set editing shape — one row per exercise, expanded to
// PerformedSet[] on save (see utils/workout-conversion.ts). exerciseType and
// bodyweight are exercise-wide; holdSeconds/peNotes/legacy are hidden
// passthroughs so editing migrated data never drops hold/notes/legacy data.
export type DraftExerciseRow = {
  exerciseId: string | null;
  variationId: string | null;
  label: string;
  exerciseType: ExerciseType;
  bodyweight: boolean;
  sets: DraftSet[];
  holdSeconds?: number;
  peNotes?: string;
  legacy?: Record<string, unknown>;
};
