# Legacy workout subcollection

Path: `users/{uid}/workouts/{oldWorkoutId}` · Type: `LegacyWorkout`/`LegacyExercise`
(documented in [`firestore-data-refactor.md`](../firestore-data-refactor.md), not
in `types/workout.ts` — these types aren't used by any live app code path
anymore, only referenced conceptually).

Pre-migration data. The app cutover to the canonical `workouts/{workoutId}`
collection ([workouts.md](./workouts.md)) is complete — every read/write in
the live app goes through the canonical collection. This subcollection still
exists, untouched, as a backup of the original data.

## Shape (historical reference only)

```ts
type LegacyWorkout = {
  name: string;
  date: Timestamp;
  notes?: string;
  exercises: LegacyExercise[];
};

type LegacyExercise = {
  name: string;
  exerciseType: string; // e.g. "Sets of Reps", "Sets of Duration"
  sets: number;
  reps?: number;
  weight?: number;
  bodyweight?: boolean;
  durationMinutes?: number;
  durationSeconds?: number;
  holdSeconds?: number;
};
```

Note the shape: `sets` is a **count**, and `reps`/`weight` are single
aggregate values applied to all sets in that row — not a set-by-set array.
This is exactly what the migration expanded into `PerformedSet[]` (one entry
per set, each with its own values) when writing to `workouts/{workoutId}`.
See [workouts.md](./workouts.md) and `MigrationSource` for how a migrated
canonical doc points back to its source row here.

## The only remaining live touchpoint: account deletion

`app/(tabs)/settings.tsx`'s account-delete flow deletes every doc in this
subcollection as part of a full account wipe — intentionally, since deleting
a user should delete all of their data, including the pre-migration backup.
This is the one place in the live app that still writes (deletes) here; there
is no other read or write path.

## Do not delete this data outside of account deletion

Per the migration doc, bulk-deleting this subcollection independently of
account deletion is deferred pending an explicit backup + approval step — it
hasn't happened, and this data should be treated as the last line of defense
if the canonical migration is ever found to have dropped or corrupted
something. Don't write a cleanup script against this path without checking
that decision is still current.
