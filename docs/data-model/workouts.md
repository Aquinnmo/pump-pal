# Workouts

Path: `workouts/{workoutId}` · Type: `Workout` (`types/workout.ts`)

Top-level collection (not nested under `users/{uid}`). Every doc carries its
own `userId` — all app queries filter with `where('userId', '==', uid)`
rather than relying on path nesting. This is what let workouts move out from
under `users/{uid}/workouts/*` (see [legacy.md](./legacy.md)) without an
`exerciseId`-shaped path change.

## Shape

```ts
type Workout = {
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
};

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

Field notes:

- `date` accepting three shapes is not an accident to "fix" — freshly-created
  workouts write a `Timestamp`, migrated workouts came through with a plain
  `{ seconds, nanoseconds }` object, and in-memory drafts use `Date`. Always
  go through `toDateObj()` (`utils/workout-conversion.ts`) rather than
  assuming one shape.
- `exerciseId`/`variationId` reference `exercises/{exerciseId}` and its
  embedded `variations[]` (see [exercises.md](./exercises.md)).
  `exerciseNameSnapshot`/`variationNameSnapshot` are **denormalized copies**
  of the name at the time the set was logged — they exist so a workout still
  displays a sensible label if the catalog entry is later renamed or (in
  theory) removed. Don't use them for lookups; use the ids.
- `variationId: null` means "parent exercise selected, no variation" — a
  valid, common state, not a missing-data marker.
- `legacy?: Record<string, unknown>` on `PerformedExercise` retains whatever
  the original legacy row had that didn't map cleanly to the canonical shape
  (see [legacy.md](./legacy.md)). Present only on migrated data.
- `PerformedSet` fields are a superset covering every tracking mode
  (`reps_weight`, `reps_bodyweight`, `duration`, `distance` — see the
  `TrackingMode` caveat in [exercises.md](./exercises.md)). Which fields are
  populated on a given set depends on the exercise's tracking mode; there's
  no per-mode subtype, callers just read the fields relevant to how that
  exercise is tracked.
- `holdSeconds` is distinct from `durationSeconds`: `durationSeconds` is the
  tracked duration of a duration-mode exercise (e.g. a plank's total hold
  time as the primary metric); `holdSeconds` is a hold component attached to
  an otherwise reps-based set (e.g. "3 reps with a 2s hold at the bottom").
  Both can be absent, and in practice are mutually exclusive per set.

## `MigrationSource`

```ts
type MigrationSource = {
  type: 'legacy_user_subcollection';
  path: string;
  oldWorkoutId: string;
};
```

Present only on workouts that came from the legacy migration. `path` is the
original `users/{uid}/workouts/{oldWorkoutId}` path; `oldWorkoutId` is
duplicated out of that path for convenience. Absent on workouts created
natively in the V2 app.

## Doc ID convention

Migrated workout IDs are deterministic — derived from
`users/{uid}/workouts/{oldWorkoutId}` — which is why re-running the migration
write script updates the same 71 docs instead of duplicating them. Natively
created workouts get Firestore auto-generated IDs.

## AI consumers

`utils/muscle-analysis.ts` and `utils/workout-suggestions.ts`
both read `performedExercises[].sets` to build prompts through AI SDK Core. As of the
muscle-taxonomy work, neither one joins back to the exercise catalog to read
`primaryMuscles`/`secondaryMuscles` — `muscle-analysis.ts` now uses
the AI model to classify muscle groups from exercise data with canonical
muscle vocabulary (`Chest, Back, Shoulders, ...` — not the canonical
`MuscleId` list). Rewiring these to aggregate real per-muscle volume via
`exerciseId`/`variationId` → catalog lookup is a known follow-up, not done as
part of adding the muscle data; catalog attribution is now implemented.
