# Pump Pal Data Model

Source of truth for every Firestore collection/document the app reads or
writes. Firebase project: `pumppal-c9199`. When code and this doc disagree,
treat this doc as correct and fix the code (or fix the doc in the same PR that
changes the shape).

For the historical record of the legacy-to-canonical migration (what changed,
when, and why), see [`firestore-data-refactor.md`](../firestore-data-refactor.md).
This directory describes the schema as it exists today.

## Collections

| Path | Purpose | Doc |
| --- | --- | --- |
| `exercises/{exerciseId}` | Global exercise catalog (with embedded variations) | [exercises.md](./exercises.md) |
| `exerciseCatalogMeta/current` | Cache-invalidation version marker for the catalog | [exercises.md](./exercises.md#exercisecatalogmetacurrent) |
| `workouts/{workoutId}` | Canonical set-by-set workout history | [workouts.md](./workouts.md) |
| `users/{uid}` | Per-user profile (currently just workout split) | [users.md](./users.md) |
| `users/{uid}/pushup-challenge/data` | Pushup Challenge (TPC tab) progress | [pushup-challenge.md](./pushup-challenge.md) |
| `users/{uid}/workouts/{oldWorkoutId}` | **Legacy**, pre-migration workout rows | [legacy.md](./legacy.md) |

## Conventions used throughout

- **Types live in code.** Every shape below has a matching TypeScript type,
  named in each doc, usually in `types/workout.ts`. Read the type for the
  exact field list; these docs add the *why* and the parts types can't
  express (which fields are optional in practice, what values actually show
  up, id conventions).
- **`schemaVersion: 2`** marks canonical (post-migration) documents in the
  `exercises` and `workouts` collections. There is no `schemaVersion: 1` in
  active use; it's a leftover marker from the migration, kept so a future
  breaking change has somewhere to bump from.
- **Timestamps**: canonical docs use Firestore `Timestamp` (via
  `serverTimestamp()` on write). One exception — `Workout.date` also accepts a
  plain `{ seconds, nanoseconds }` shape and `Date`, because migrated rows and
  freshly-created rows go through different code paths before they're
  normalized for display (see `utils/workout-conversion.ts`).
- **IDs are deterministic where possible.** Exercise doc IDs are slugs
  (`bench-press`), not auto-generated — this is what makes catalog reseeding
  idempotent (see [exercises.md](./exercises.md)). Migrated workout doc IDs
  are derived from the legacy path for the same reason (see
  [legacy.md](./legacy.md)).
