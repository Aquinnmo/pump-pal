# Pump Pal Firestore Data Refactor

> **This is the migration history, not the current schema reference.** For
> the live, maintained data model, see [`docs/data-model/`](./data-model/README.md).
> This doc is kept as a record of what changed and why during the
> legacy-to-canonical cutover.

## Current Status

Firestore data migration is complete for the current legacy workout snapshot.

- Project: `pumppal-c9199`
- Exercise catalog seeded: 34 `exercises` docs
- Migrated legacy workouts written: 71 top-level `workouts` docs
- `exerciseCatalogMeta/current` written: 1 doc
- Latest migration parity: passed
- Unmapped legacy exercise names: 0
- Legacy workout subcollections: still present, untouched
- App cutover: complete — all reads/writes go through the top-level `workouts`/`exercises` collections

No legacy user workout data was deleted during migration.

## Refactor Goal

Move from developer-flexible workout rows to analytics-ready canonical data:

- one global exercise catalog
- workout documents stored at top-level
- set-by-set workout history
- exercise references by stable IDs
- variations stored as structured metadata under one canonical exercise family
- UX remains one simple exercise picker

## Canonical Collections

### `exercises/{exerciseId}`

One document per exercise family.

Example document ID:

```text
bench-press
```

Required shape:

```ts
type Exercise = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementPattern: string;
  equipment: string[];
  bodyRegion: 'upper' | 'lower' | 'core' | 'full_body';
  mechanics: 'compound' | 'isolation' | 'static' | 'cardio';
  forceType: 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'rotation' | 'static' | 'mixed';
  trackingModes: TrackingMode[];
  variations: ExerciseVariation[];
  schemaVersion: 2;
  updatedAt: Timestamp;
};
```

Optional future fields:

```ts
type ExerciseOptionalFields = {
  instructions?: string[];
  contraindications?: string[];
  analyticsTags?: string[];
};
```

### `ExerciseVariation`

Variations are not separate Firestore documents. They are structured entries inside the parent exercise.

Example:

```json
{
  "id": "dumbbell_flat",
  "name": "Flat Dumbbell Bench Press",
  "aliases": ["db bench", "dumbbell bench"],
  "equipment": "dumbbell",
  "angle": "flat"
}
```

Variation identity stored in workouts:

```json
{
  "exerciseId": "bench-press",
  "variationId": "dumbbell_flat"
}
```

Parent-only selection stays valid:

```json
{
  "exerciseId": "bench-press",
  "variationId": null
}
```

Use variations for analytics-relevant differences:

- equipment: barbell, dumbbell, cable, machine, smith machine
- angle: flat, incline, decline
- grip or stance: wide, narrow, neutral, sumo
- side: bilateral, unilateral, left, right
- modality: assisted, weighted, bodyweight

Do not create variations for temporary notes, pain notes, typos, or one-off user wording.

### `exerciseCatalogMeta/current`

Small metadata doc for cache invalidation.

```ts
type ExerciseCatalogMeta = {
  version: number;
  exerciseCount: number;
  schemaVersion: 2;
  updatedAt: Timestamp;
};
```

App behavior:

- load catalog after auth
- cache catalog in `AsyncStorage`
- check `exerciseCatalogMeta/current.version`
- refetch catalog only when version changes

### `workouts/{workoutId}`

Top-level canonical workout document.

```ts
type Workout = {
  userId: string;
  name: string;
  date: Timestamp;
  notes: string;
  performedExercises: PerformedExercise[];
  schemaVersion: 2;
  source?: MigrationSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Migrated workout IDs are deterministic from:

```text
users/{uid}/workouts/{oldWorkoutId}
```

This makes reruns idempotent. Re-running migration updates the same target docs instead of creating duplicates.

### `MigrationSource`

Present on migrated workouts.

```ts
type MigrationSource = {
  type: 'legacy_user_subcollection';
  path: string;
  oldWorkoutId: string;
};
```

### `PerformedExercise`

```ts
type PerformedExercise = {
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
```

`legacy` is retained on migrated docs to preserve original aggregate rows and unknown fields.

### `PerformedSet`

```ts
type PerformedSet = {
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
};
```

## Migration Rules Used

Legacy aggregate rows were expanded into set-by-set rows.

Legacy:

```json
{
  "name": "DB Bench",
  "exerciseType": "Sets of Reps",
  "sets": 3,
  "reps": 8,
  "weight": 42.5,
  "bodyweight": false
}
```

Migrated:

```json
{
  "exerciseId": "bench-press",
  "variationId": "dumbbell_flat",
  "sets": [
    { "setNumber": 1, "reps": 8, "weight": 42.5, "bodyweight": false },
    { "setNumber": 2, "reps": 8, "weight": 42.5, "bodyweight": false },
    { "setNumber": 3, "reps": 8, "weight": 42.5, "bodyweight": false }
  ]
}
```

Duration rows store `durationSeconds` per set.

`Sets of Reps with Hold` rows preserve `holdSeconds` per set.

Weighted dips and weighted pull-ups use the same model:

- legacy rows map to weighted variation
- each set still preserves exact `bodyweight` and `weight`
- analytics can distinguish variation and actual load state

## Exercise Picker UX

Schema changes should not add user friction.

User flow remains:

1. Tap add exercise.
2. Search one field.
3. Pick one human label.
4. Enter sets/reps/weight or duration.
5. Save.

No required "pick parent, then pick variation" step.

The app should flatten catalog entries in memory:

```ts
type ExerciseSearchOption = {
  label: string;
  exerciseId: string;
  variationId: string | null;
  tokens: string[];
  aliases: string[];
  primaryMuscles: string[];
  equipment: string[];
};
```

Example search results for `bench`:

- `Bench Press`
- `Flat Barbell Bench Press`
- `Flat Dumbbell Bench Press`
- `Incline Barbell Bench Press`
- `Incline Dumbbell Bench Press`

If user chooses `Flat Dumbbell Bench Press`, store `bench-press` plus `dumbbell_flat`.

If user chooses `Bench Press`, store `bench-press` plus `null`.

## Search Ranking

Do not query Firestore per keystroke.

Rank in memory:

1. recently used exact label
2. exact label
3. starts-with label
4. alias match
5. contains all words
6. muscle or equipment token match

## Legacy Data Still Present

Old workout data remains at:

```text
users/{uid}/workouts/{oldWorkoutId}
```

Old shape:

```ts
type LegacyWorkout = {
  name: string;
  date: Timestamp;
  notes?: string;
  exercises: LegacyExercise[];
};

type LegacyExercise = {
  name: string;
  exerciseType: string;
  sets: number;
  reps?: number;
  weight?: number;
  bodyweight?: boolean;
  durationMinutes?: number;
  durationSeconds?: number;
  holdSeconds?: number;
};
```

Keep legacy data until app cutover, export, analytics, and account-delete behavior are verified against the new structure.

## Completed Work

- Read-only Firestore snapshot built.
- Legacy inventory built.
- 69 distinct legacy exercise names mapped.
- Reviewed catalog seed built.
- Mapping validation passed.
- Dry-run conversion passed.
- Exercise catalog written to Firestore.
- 71 legacy workouts written to top-level `workouts`.
- Migration parity passed:
  - workout count
  - exercise row count
  - set count
  - reps
  - weighted volume
  - duration seconds
  - hold seconds
- `pumppal-read-only-perms.json` and `pumppal-write-perms.json` ignored by git.

## Remaining Work

App cutover shipped: all reads/writes go through top-level `workouts`/`exercises`, filtered by `userId`, with set-by-set `performedExercises[].sets`, a flattened searchable exercise picker, and an `under-review` custom-exercise flow. `app/modal.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/workouts.tsx`, `app/(tabs)/analytics.tsx`, `app/(tabs)/settings.tsx`, `components/workout-card.tsx`, `utils/gemini-muscle-analysis.ts`, and `utils/gemini-workout-suggestions.ts` all consume the canonical shape.

The TPC (pushup-challenge) tab is a live, intentional feature — not migration debt. Its `users/{uid}/pushup-challenge/data` doc and account-delete cleanup are unrelated to the workout schema and stay as-is.

Only remaining item, deferred pending explicit approval:

- export backup of legacy `users/{uid}/workouts`
- delete old workout subcollections only after that backup and explicit approval

## Verification Checklist

Verified after app cutover:

- migrated workouts display in app
- new workout save writes V2 shape only
- exercise search works from cached catalog
- analytics work from `performedExercises[].sets`
- CSV export works from V2
- account delete deletes top-level workouts for user
- AI prompts consume V2 shape
- old notes preserved
- decimal weights preserved
- duration and hold data preserved
- no Firestore query per exercise-search keystroke
