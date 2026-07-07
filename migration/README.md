# v2 Migration Inputs

This folder holds durable local inputs for the Firestore v2 migration. The
source collections stay untouched. New data is generated locally first,
validated, and then written into `v2-*` collections.

Target Firestore shape:

- `v2-users/{uid}`
- `v2-users/{uid}/v2-workouts/{workoutId}`
- `v2-exercises/{exerciseId}`

## Current Direction

The migration is now catalog-first and interactive:

1. Create the canonical exercise database in `v2-exercises`.
2. Refresh the Firestore export.
3. Run an interactive terminal mapper.
4. When the mapper encounters a historical source exercise name that is not
   mapped yet, enter the existing database `exerciseId` plus the usage flags.
5. Generate local v2 user/workout artifacts.
6. Write only after validation passes.

The mapping cache is still kept locally, but it should be produced by the
interactive script rather than manually bulk-approved.

Recommended mapping cache:

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

`equipment` and `limbMode` may be strings or `null`. `hasHoldSeconds` does not
belong in the mapping cache; hold seconds are generated from each source workout
entry during migration. Historical `Sets of Reps with Hold` entries are
migrated as `Sets of Reps` with `flags.hasHoldSeconds` set from the source
workout entry. All other migrated usages default `flags.hasHoldSeconds` to
`null`.

Angle variants should remain separate exercises instead of being represented as
flags.

## Existing Inventory Artifacts

`scripts/build-exercise-inventory.js` reads
`temp/firestore-workouts-export.json` and generates:

- `temp/exercise-name-inventory.json`
- `temp/exercise-name-inventory.csv`
- `temp/phase-1-validation-report.json`
- `migration/exercise-name-map.json`

These artifacts are still useful for understanding the historical source data,
but the migration plan should move toward a resumable interactive mapper that
asks for missing mappings in the terminal.

## Planned Script Behavior

The interactive mapper should:

- read the refreshed Firestore export
- read the existing v2 exercise catalog
- read the existing mapping cache when present
- prompt only for unmapped source exercise names
- validate that each entered `exerciseId` exists in `v2-exercises`
- ask for `equipment`
- ask for `limbMode`
- save each answer immediately so the script is resumable

The v2 artifact builder should:

- refuse mappings whose `exerciseId` is not in the v2 catalog
- generate `flags.equipment` and `flags.limbMode` from the mapping cache
- generate `flags.hasHoldSeconds` only from source workout usage data
- build local v2 user/workout artifacts before any Firestore write

The writer should only run after the local report has `passed: true`.
