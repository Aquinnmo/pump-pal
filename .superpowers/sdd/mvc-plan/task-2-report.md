# P2 report — `pump-pal-rvjm.2`

## Changed files

- Replaced inline split-name/cache logic in `apps/mobile/app/modal.tsx`, `apps/mobile/app/planned-workouts.tsx`, and `apps/mobile/app/active-workout.tsx` with `loadSplitNames`.
- Exported `approvedCatalog` from `apps/mobile/src/lib/catalog-loader.ts` and reused it from the native catalog repository.
- Removed `approvedSnapshot`, catalog `replaceAll`/`setMeta` exports and implementations, and only their catalog/parity test blocks.
- Removed `LocalRepository` while retaining `LocalSingletonRepository`.
- Retained `getSyncCursor` with the required test-probe comment.
- Added the intentional `TrackingMode`/`TRACKING_MODES` distinction comments.
- Added follow-up Bead `pump-pal-rvjm.9` (`investigate TrackingMode vs TRACKING_MODES unification`).

## Pre-validation findings

- `graphify query` located the shared `loadSplitNames` helper, all three inline screen copies, catalog predicate/repository paths, and the P2 plan nodes.
- `rg` confirmed `replaceSnapshot` did not call the soon-to-be-removed `replaceAll` or `setMeta` functions.
- No production caller used `LocalRepository`; only its definition remained.
- The optional purge slice encountered friction immediately because `purgeUid` is imported directly by migration/account parity tests, so P2.4 was skipped in full.

## Required verification

- `rg -n "pumppal_split_names_v2" apps/mobile/app`: zero matches.
- `rg -n "approvedSnapshot" apps/mobile`: zero matches.
- `bun run typecheck`: passed.
- `bun run test`: passed — 302 mobile tests, plus contract/API/tools gates; 0 failures.
- `bun run lint`: passed with 0 errors and 12 pre-existing warnings.
- `graphify update .`: passed; graph rebuilt with 3,699 nodes and 7,402 edges. It reported existing metadata/unsupported Gradle extraction warnings.
- Screen tests and `apps/mobile/tests/setup.ts` were not edited.
- No Expo build/export command was run.

## Bead and commit

- Claimed `pump-pal-rvjm.2` before implementation.
- Created `pump-pal-rvjm.9` for the TrackingMode follow-up.
- Commit: final phase commit; hash provided in the handoff below (`refactor(mobile): deduplicate catalog and split-name surfaces`).

## Concerns

- The full test suite emits expected error-path logs/warnings from existing tests; all assertions passed.
- P2.4 remains intentionally untouched for a later focused change.
