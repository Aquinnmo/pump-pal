# Pump Pal v2 Firestore Migration Plan

## Summary

Create a new v2 Firestore data model from the existing `users` collection
without changing the current production documents. The migration reads all data
needed from `users/{uid}` and `users/{uid}/workouts/{workoutId}`, generates
local v2 artifacts, validates them, and only then writes new `v2-*`
collections.

The new workflow is catalog-first. Build the canonical exercise database before
migrating workout history. Then run an interactive terminal mapping script that
walks through historical workout exercises. When it encounters a source
exercise name that has not been mapped yet, it prompts for the existing
database `exerciseId` and the usage flags needed for that historical name.

Target collections:

- `v2-users/{uid}`
- `v2-users/{uid}/v2-workouts/{workoutId}`
- `v2-exercises/{exerciseId}`

The existing `users` collection and nested `workouts` subcollections remain the
source of truth until the app is later switched to read from v2.

## Migration Rules

- Create or import the canonical exercise catalog in `v2-exercises` before
  mapping workout history.
- Refresh the source export before migration by running
  `temp/export-firestore-workouts.js`.
- Use an interactive terminal mapping script for historical workout exercise
  names instead of bulk-editing mappings by hand.
- The interactive script must prompt only when it finds a source exercise name
  that is not already mapped.
- The entered `exerciseId` must already exist in the v2 exercise catalog.
- The mapping for a source exercise name must include only these default usage
  flags:
  - `equipment`
  - `limbMode`
- Treat `Sets of Reps with Hold` as `Sets of Reps` plus a nullable
  `flags.hasHoldSeconds` value on the workout exercise usage.
- `hasHoldSeconds` is usage data generated during migration. It is not stored
  as a mapping default.
- Keep angle-specific movements as separate exercises instead of encoding angle
  as a flag.
- Generate local v2 JSON and a validation report before any Firestore write.
- Write only to `v2-*` collections after local validation passes.

## v2 Data Shape

### `v2-users/{uid}`

Preserve user-level data currently used by the app, including fields such as
`workoutSplit` and `aiUsage`.

Required migration metadata:

- `schemaVersion: 2`
- `sourceUserPath`
- `migratedAt`

### `v2-users/{uid}/v2-workouts/{workoutId}`

Preserve workout history under each user while switching exercise entries to
catalog references.

Required fields:

- `name`
- `date`
- `notes`
- `schemaVersion: 2`
- `sourceWorkoutPath`
- `exercises`

Each exercise entry should preserve the original workout performance data and
add an `exerciseId` from the existing v2 exercise catalog.

Required workout exercise usage fields:

- `order`
- `exerciseId`
- `sourceName`
- `exerciseType`
- `flags`
- performance fields such as `sets`, `reps`, `weight`, `bodyweight`, or
  duration fields

Usage flag shape:

```json
{
  "equipment": "dumbbell",
  "limbMode": "both",
  "hasHoldSeconds": null
}
```

`equipment` and `limbMode` come from the interactive mapping answer for that
source exercise name. `hasHoldSeconds` defaults to `null` and is set only when
the historical workout entry specifies `Sets of Reps with Hold`.

### `v2-exercises/{exerciseId}`

Create shared catalog records before migrating workout history.

Required fields:

- `displayName`
- `aliases`
- `status: "active"`
- `defaultTrackingMode`
- `supportsBodyweight`
- `schemaVersion: 2`

Multiple historical source names may map to the same `exerciseId` when their
differences are represented by usage flags. For example, equipment and
single-arm variants can share a canonical exercise while keeping distinct
mapping flags. Incline, decline, or other angle-specific movements should
remain separate exercises.

## Interactive Mapping Flow

The interactive mapping script should read:

- the refreshed Firestore export
- the existing v2 exercise catalog
- the current mapping cache, if one exists

For each historical workout exercise usage:

1. Normalize the source exercise name.
2. Check whether that source name already has a mapping.
3. If it is mapped, reuse the saved `exerciseId`, `equipment`, and `limbMode`.
4. If it is new, print useful context:
   - source exercise name
   - occurrence count
   - workout/user count
   - observed exercise types
   - observed bodyweight values
   - example workout paths
5. Prompt for the existing catalog `exerciseId`.
6. Validate that the `exerciseId` exists in `v2-exercises`.
7. Prompt for `equipment`.
8. Prompt for `limbMode`.
9. Save the answer to the mapping cache.
10. Continue until every source exercise name is mapped.

The script should be resumable. If it stops midway, running it again should
reuse prior answers and continue at the next unmapped source exercise.

## Mapping Cache Shape

The mapping cache remains a durable local artifact, but it is generated and
updated by the interactive script rather than bulk-approved by hand.

Recommended path:

- `migration/exercise-name-map.json`

Recommended entry shape:

```json
"Bicep Curls": {
  "exerciseId": "bicep-curls",
  "flags": {
    "equipment": "dumbbell",
    "limbMode": "both"
  },
  "sourceCount": 14,
  "sourceWorkoutCount": 14,
  "sourceUserCount": 1,
  "notes": ""
}
```

The mapping cache intentionally does not include `hasHoldSeconds`. Hold seconds
come from each individual source workout exercise during v2 artifact
generation.

## Implementation Phases

1. Build v2 exercise catalog
   - Decide the canonical exercise list.
   - Create local catalog JSON.
   - Validate stable `exerciseId` values.
   - Write or import catalog records to `v2-exercises`.

2. Refresh export
   - Run the Firestore export script.
   - Confirm the exported user and workout counts.

3. Run interactive mapper
   - Run the planned interactive mapping script.
   - Prompt only for source names missing from the mapping cache.
   - Enter an existing v2 catalog `exerciseId`.
   - Enter `equipment` and `limbMode`.
   - Save each answer immediately.

4. Generate local v2 artifacts
   - Build `temp/v2-users.json`.
   - Build `temp/v2-workouts.json`.
   - Build `temp/v2-migration-report.json`.
   - Do not generate exercise catalog records from historical names; those
     should already exist in `v2-exercises`.

5. Validate local output
   - Source and v2 user counts must match.
   - Source and v2 workout counts must match.
   - Every v2 workout exercise must have a mapped catalog `exerciseId`.
   - Every mapped `exerciseId` must exist in the v2 exercise catalog.
   - Every v2 workout exercise must include usage flags for `equipment`,
     `limbMode`, and `hasHoldSeconds`.
   - The report must show zero blockers.

6. Write v2 user/workout collections
   - Run the v2 writer after validation passes.
   - Use stable document IDs.
   - Write users to `v2-users/{uid}`.
   - Write workouts to `v2-users/{uid}/v2-workouts/{workoutId}`.

7. Verify Firestore output
   - Read back the v2 collections.
   - Compare counts against the local report.
   - Spot-check representative migrated users and workouts.

## Current Known Work

- Create the canonical v2 exercise catalog before workout migration.
- Replace manual mapping approval with a resumable interactive terminal mapper.
- Update the v2 artifact builder so it validates mappings against the existing
  catalog instead of generating `v2-exercises` from historical source names.
- Keep `Sets of Reps with Hold` conversion as workout usage data:
  `Sets of Reps` plus `flags.hasHoldSeconds`.

## Acceptance Criteria

- The old `users` data remains unchanged.
- The canonical exercise catalog exists before workout history migration.
- The interactive mapper prompts only for new historical source exercise names.
- Every saved mapping points to an existing `v2-exercises/{exerciseId}` record.
- Local v2 artifacts are generated before Firestore writes.
- Firestore writes target only `v2-*` collections.
- Workout exercise usages include `equipment`, `limbMode`, and nullable
  `hasHoldSeconds` flags.
- Firestore verification confirms that v2 user and workout counts match the
  local migration report.
