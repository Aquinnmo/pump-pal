# Timber mobile MVC restructure — phased plan for cheap executor models

## Context

The mobile app (`apps/mobile`) has a well-built model layer (`src/data/`: repositories + offline sync, no screen touches Firestore/SQLite directly) and a fully-tested view layer (`src/ui/`), but **no controller tier**: four screens exceed 1000 lines (`analytics` 1324, `pushup-challenge` 1274, `active-workout` 1130, `modal` 1037) and hold inline business logic, state machines, and repository orchestration. There is also real duplication (a 15-line split-names block copy-pasted into three screens) and dead code (~200 lines of retired Worker-transport schemas in `packages/contract`).

The user chose: **literal `src/models` / `src/views` / `src/controllers` folder layout**, plus **dedupe and dead-code deletion including dead-but-tested code** (delete the now-pointless assertions with it). Core behavior pinned by tests must not change: tests may be MOVED and their import/mock paths updated; assertions may only be DELETED when the production code they pin is deleted as dead.

**Why this plan is written the way it is:** it will be executed by less-capable models. Every phase is one shippable PR with one mechanical rule where possible, mandatory pre/post greps, and explicit keep-lists. Do not improvise beyond what a phase specifies.

### Verified facts this plan relies on (do not re-derive, do not doubt)

- `apps/mobile/tests/setup.ts` is **layout-agnostic**: its `@/` alias resolver (L83–93) walks `<root>/src/<x>` then `<root>/<x>` generically, and `webModuleEntries(join(mobileRoot,'src'))` (L95–109, used at L134) recursively auto-registers every `*.web.ts(x)` under `src/**`. It survives any rename under `src/` — **never edit it**.
- `tools/check-boundary-isolation.js` scans `apps/mobile/src` wholesale — layout-agnostic, never edit.
- `tools/check-web-native-deps.js` hardcodes `src/data/*.web.ts` paths at L24–32 and **fails loud** (exit 1) on a missing entry — must be edited in the same commit as the P3 move.
- `tools/check-direct-boundaries.js` L12 reads `apps/mobile/src/data/remote` by literal path — same commit as P3.
- **51 mobile test files mock modules by filesystem path** (`mock.module(new URL('../../src/data/x.web.ts', import.meta.url).pathname, …)`). These mocks **fail open**: if the path no longer exists the mock silently doesn't apply and the test hits the real module. Every move phase therefore ends with a zero-stale-path grep — these greps are not optional.
- `apps/mobile/tsconfig.json` maps `@/*` → `["./src/*", "./*"]`, so `@/models`, `@/views`, `@/controllers` resolve with **no config change anywhere**.
- Contract corrections (verified by grep — these override any earlier notes):
  - `syncableKind`/`SYNCABLE_KINDS`/`SyncableKind` are LIVE (`apps/mobile/src/data/sync-engine.ts` imports `SYNCABLE_KINDS`; live `manifestEntry`/`pullRequest` reference `syncableKind`). KEEP.
  - `createInjuryInput`/`updateInjuryInput` are LIVE (`apps/api/src/store/injuries.ts` imports their `z.infer` types). KEEP.
- `profileFromDto`/`profilePatch`/`challengeFromDto` (private in `src/data/sync.ts`) and `dtoToWorkout` (private in `workout-repository.web.ts`) each exist exactly once — **no converter consolidation; skip it.**
- `getSyncCursor` stays: `sync-cursors.test.ts` uses it as the only observer of the live `setSyncCursor` write (`sync-engine.ts:398`). Deleting it deletes coverage of live code.
- `approvedSnapshot` (`src/data/catalog-repository.ts:9–14`) and `approvedCatalog` (`src/lib/catalog-loader.ts:15–21`) enforce identical conditions — safe to unify on `approvedCatalog`.
- Analytics' local formatters (`formatDuration`/`formatPounds`/`formatSignedPounds`) are NOT duplicated elsewhere (`workout-notification-model.ts`'s private `formatDuration` has a different format). They are view formatting — leave in the screen.
- Web `byDate` sort in `workout-repository.web.ts` deliberately re-derives SQL ORDER BY; comments acknowledge it. Leave it.

## Phase overview

```
P1  contract dead code            packages/contract only        ~250-line diff
P2  mobile dedupe + dead code     current layout                ~250 lines
P3  src/data  -> src/models       mechanical rename, one rule
P4  src/ui    -> src/views        mechanical rename, one rule
P5  src/lib split: domain -> models, hooks -> hooks
P6  controller: analytics         ~350 lines out of the screen
P7  controller: pushup-challenge  ~300 lines
P8  controller: active-workout    ~250 lines (highest risk, last)
Appendix: recipe + specifics for 5 more screens (follow-up PRs)
```

Ordering rationale: deletions first while paths are familiar (pure-minus diffs); then three **separate** move PRs — each a single grep-verifiable rewrite rule, so a broken mock path in P3 can't be confused with one from P5; controllers last so new files are born directly into `src/controllers/` + `src/models/` and never re-moved.

## DO NOT TOUCH (every phase)

- `apps/mobile/tests/setup.ts` — verified layout-agnostic.
- `apps/mobile/app/**` file **locations/names** (expo-router + screen-test contract). Contents change only where P2/P6–P8 say so.
- The `.web.ts`/`.web.tsx` twin convention — twins move together, stay adjacent, keep suffixes (pinned by 7 `*-parity.test.ts` files + `platform-adapters.test.ts`/`platform-native-adapters.test.ts`).
- `src/data/sync-engine.ts` semantics — import-path edits only, ever.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `apps/api/**`, `apps/wear/**`.
- `tools/check-boundary-isolation.js`.
- `apps/mobile/metro.config.js`, `apps/mobile/tsconfig.json`, root/package `test` scripts.
- `apps/mobile/{assets,modules,plugins,targets,widgets}/` at package root.
- `TRACKING_MODES` (contract) vs `TrackingMode` (`src/types/workout.ts`) — different enums on purpose (catalog-variation wire mode vs performed-set entry mode). Document only (P2.5), never unify.
- The `useSyncExternalStore` module-singleton pattern (`data-version.ts`, `active-workout-session.ts`, `ai-quota-cache.ts`) — pattern stays; files only move.
- **Never run any expo build/export** (`bunx expo run:*`, `expo export`, `bun run build:web`). Verification is ONLY: `bun run typecheck`, `bun run test`, `bun run lint`, plus per-phase greps.

## Global executor rules (repeat every phase)

1. Branch off main: `git checkout main && git checkout -b <phase-branch>`. Never commit or push to main. Never merge anything.
2. **Before opening each PR: STOP and ask the user which Timber epic the child GitHub issue belongs under.** Never create an epic — only a child issue under an existing epic. One child issue per phase PR. Track work in `bd` as you go.
3. Verification, in order, all green: `bun run typecheck` → `bun run test` → `bun run lint` → the phase's greps.
4. After code changes: `graphify update .`
5. Push branch, then `gh pr create --draft` (draft only, never ready), linking the child issue.
6. macOS BSD sed: `sed -i '' -e '...'` — the empty string after `-i` is required.
7. If a screen test in `tests/screens/` fails during P2 or P6–P8, the refactor is wrong — fix the refactor, **never edit the screen test**.

---

## Phase 1 — Delete dead contract surface (`packages/contract` only)

**Branch:** `chore/contract-dead-code`

### 1.1 Per-name pre-verification (mandatory before each deletion)

For each name in 1.2 (and its capitalized derived type):

```
rg -n "\b<name>\b" apps packages tools --glob '!*.test.*'
```

Expected: hits ONLY inside `packages/contract/src/api-contract.ts`. Any other hit → do NOT delete that name; note it in the PR description.

### 1.2 Delete from `packages/contract/src/api-contract.ts` (line numbers approximate)

- `conflictResponse` (L40–48) + `ConflictResponse`
- `listQuery` (L50–54) + `ListQuery` — only after its two internal users `listWorkoutsQuery` (L267) and `manifestQuery` (L535) are deleted in the same commit
- `listResponse` — only internal user is `manifestResponse`, deleted below
- `injuryMutationResponse` (L193), `injuriesListResponse` (L194)
- `workoutResponse` (L263) + `WorkoutResponse`
- `listWorkoutsQuery` (L267–270) + `ListWorkoutsQuery`
- `createWorkoutInput` (L277–287) + `CreateWorkoutInput`
- `updateWorkoutInput` (L290–299) + `UpdateWorkoutInput`
- `reorderWorkoutsInput` (L302–305) + `ReorderWorkoutsInput`
- `pushupChallengeResponse` (L389) + `PushupChallengeResponse`
- `putPushupChallengeInput` (L397–403) + `PutPushupChallengeInput`
- `manifestQuery` (L535), `manifestResponse` (L536)
- `pullResponse` (L549–556) + `PullResponse`

**Explicit KEEP list** (even if something calls them dead): `syncableKind`, `SYNCABLE_KINDS`, `SyncableKind`, `createInjuryInput`/`CreateInjuryInput`, `updateInjuryInput`/`UpdateInjuryInput`, `manifestEntry`/`ManifestEntry`, `pullRequest`/`PullRequest`, `version`, `workoutDTO`, `injuryDTO`, `pushupChallengeDTO`, `challengeDay`, `errorResponse`, and everything not listed for deletion.

### 1.3 Tests

In `packages/contract/src/api-contract.test.ts`, delete only the blocks that exercise a deleted name. Do not touch assertions for kept names.

### 1.4 Verify

```
rg -n "conflictResponse|listQuery|listResponse|listWorkoutsQuery|workoutResponse|createWorkoutInput|updateWorkoutInput|reorderWorkoutsInput|injuriesListResponse|injuryMutationResponse|putPushupChallengeInput|pushupChallengeResponse|manifestResponse|manifestQuery|pullResponse" apps packages tools
```

→ zero hits. Then the standard command list (typecheck compiles `apps/api` against the trimmed contract — the real safety net).

---

## Phase 2 — Mobile dedupe + dead code (current layout)

**Branch:** `chore/mobile-dedupe`

### 2.1 split-names triplication

`src/lib/split-names.ts` exports `loadSplitNames(uid)` — profile read + AI names + AsyncStorage cache (key `pumppal_split_names_v2`). Three screens re-implement it inline, byte-equivalent. Replace each with a call:

- `app/modal.tsx` L152–179: replace the profile-read + names derivation with `const splitNames = await loadSplitNames(user.uid);`. Keep the `usedNames` collection that follows. Remove the `profileRepository.get` call only if nothing else in the function uses `profile`.
- `app/planned-workouts.tsx` L57–75: replace the `splitType`/`customSplitDesc` derivation + cache block with `const loadedSplitNames = await loadSplitNames(user.uid);`. Keep the profile fetch above only if used elsewhere in the function.
- `app/active-workout.tsx` L269–300: this screen also does `setSplitType(splitType ?? "")` — **keep the `profileRepository.get` and `setSplitType` lines**, replace only the names block.
- In each file: remove now-unused imports (`SPLIT_WORKOUT_NAMES`, `isSplitOption`, `generateSplitWorkoutNames`, possibly `AsyncStorage`); add `import { loadSplitNames } from '@/lib/split-names';`.
- Note: `loadSplitNames` re-fetches the profile internally — one extra local repository read, not a network call; accepted.
- Safety: `loadSplitNames` reads via `@/data/profile-repository`, exactly what `tests/screens/{modal,planned-workouts,active-workout}.test.tsx` mock by path — those tests must pass **unchanged**.

### 2.2 Unify the approved-catalog predicate

- `src/lib/catalog-loader.ts`: `function approvedCatalog` (L15) → `export function approvedCatalog`.
- `src/data/catalog-repository.ts`: delete `approvedSnapshot` (L9–14); in `refresh`, replace L18–22 with:
  ```ts
  const exercises = approvedCatalog(response.exercises);
  if (!exercises)
    throw new Error(
      "Catalog response did not contain a valid approved snapshot.",
    );
  ```
  pass `exercises` to `catalog.replaceSnapshot`; add `import { approvedCatalog } from '@/lib/catalog-loader';` (data already imports from lib elsewhere, e.g. `@/lib/firestore-rest-client` — no new layering).

### 2.3 Dead mobile exports

- `src/data/remote-types.ts`: delete `interface LocalRepository<TEntity>`. Pre-grep `rg -n "LocalRepository" apps/mobile`; delete test-only references with it. Keep `LocalSingletonRepository` (implemented by the `.web` singleton repos).
- `catalogRepository.replaceAll` / `setMeta`: pre-check `rg -n "replaceAll|setMeta" apps/mobile/src/data/catalog.ts` to confirm `replaceSnapshot` doesn't call them internally. Then delete:
  - the `replaceAll`/`setMeta` methods from `src/data/catalog-repository.ts` (~L30–31, L35–36) and `src/data/catalog-repository.web.ts` (~L33, L45, and both names in the export object ~L52),
  - `replaceAll` (~L61) and `setMeta` (~L168) from `src/data/catalog.ts`,
  - the test blocks exercising them: `catalog-repository-parity.test.ts` (`Contract` members ~L21/L24 and cases ~L117–181) and any `replaceAll`/`setMeta` cases in `catalog.test.ts`. (Sanctioned deletion: these pin only the deleted code.)
- `getSyncCursor` in `src/data/sync-cursors.ts`: **KEEP**. Add comment: `// production never reads cursors yet; retained as the test probe for setSyncCursor`.

### 2.4 Purge-layer collapse (optional — skip on any friction)

Move `purgeUid`'s body from `src/data/purge.ts` into its only caller `purgeUidData` in `src/data/client.ts` (move the `UID_SCOPED_TABLES` import too), delete `purge.ts`, fix the doc reference at `remote-types.ts` L27. `client.web.ts` stub unchanged.

### 2.5 TrackingMode: document only

Add a comment at `TRACKING_MODES` (`packages/contract/src/api-contract.ts` ~L309) and at `TrackingMode` (`apps/mobile/src/types/workout.ts`): contract mode describes catalog exercise variations on the wire; mobile mode describes performed-set entry. Different enums on purpose. File a `bd` issue: "investigate TrackingMode vs TRACKING_MODES unification".

### 2.6 Verify

- `rg -n "pumppal_split_names_v2" apps/mobile/app` → zero (literal lives only in `src/lib/split-names.ts`).
- `rg -n "approvedSnapshot" apps/mobile` → zero.
- Standard command list. Screen tests pass without edits.

---

## Phase 3 — `src/data` → `src/models`

**Branch:** `refactor/models-dir`

1. `git mv apps/mobile/src/data apps/mobile/src/models`
2. One rewrite rule (covers `@/data/` imports, relative test imports `../../src/data/…`, path-keyed `mock.module` calls, `tools/check-direct-boundaries.js` L12, `tools/check-web-native-deps.js` ENTRY_POINTS L24–32, and doc/comment references):
   ```
   rg -l -e '@/data/' -e 'src/data/' apps/mobile tools CLAUDE.md docs \
     | xargs sed -i '' -e 's|@/data/|@/models/|g' -e 's|src/data/|src/models/|g'
   ```
3. Nothing else. No tsconfig/setup.ts/metro changes.

### Verify

- `rg -n "@/data/|src/data/" apps/mobile tools CLAUDE.md docs --glob '!graphify-out'` → zero.
- `rg -n "mock.module\(new URL" apps/mobile | rg "src/data"` → zero.
- `ls apps/mobile/src/models/remote` shows 6 files; `ls apps/mobile/src/models/*.web.ts` shows the same twins as before the move.
- Fail-open canary: `node -e "require('fs').accessSync('apps/mobile/src/models/profile-repository.web.ts')"`.
- Standard command list (`test:tools` proves both edited tools scripts still find their files — check-web-native-deps exits 1 on a stale entry).

---

## Phase 4 — `src/ui` → `src/views`

**Branch:** `refactor/views-dir`

1. `git mv apps/mobile/src/ui apps/mobile/src/views`
2. ```
   rg -l -e '@/ui/' -e 'src/ui/' apps/mobile CLAUDE.md docs \
     | xargs sed -i '' -e 's|@/ui/|@/views/|g' -e 's|src/ui/|src/views/|g'
   ```
   (No tools script references `src/ui` — verified.)

### Verify

- `rg -n "@/ui/|src/ui/" apps/mobile CLAUDE.md docs --glob '!graphify-out'` → zero.
- `rg -n "mock.module\(new URL" apps/mobile | rg "src/ui"` → zero.
- Standard command list (the 34 `tests/ui/*.test.tsx` dynamic imports prove resolution).

---

## Phase 5 — lib split: domain → models, hooks → hooks

**Branch:** `refactor/lib-split`

### 5.0 Twin guardrail (run first)

```
ls apps/mobile/src/lib/*.web.* apps/mobile/src/lib/*.native.* apps/mobile/src/lib/*.android.* apps/mobile/src/lib/*.ios.* 2>/dev/null
```

Every file listed must either be on the "stays in lib" list below, or be `injuries.web.ts` (moved in 5.1). If any OTHER mover has a platform twin, move the twin with it in the same `git mv` batch — twins never separate.

### 5.1 The injuries rename FIRST (name collides with `src/models/injuries.ts`, the SQL primitives; new name matches its exports `getOngoingInjuries`/`getOngoingInjuryIds`)

```
git mv apps/mobile/src/lib/injuries.ts      apps/mobile/src/models/ongoing-injuries.ts
git mv apps/mobile/src/lib/injuries.web.ts  apps/mobile/src/models/ongoing-injuries.web.ts
git mv apps/mobile/src/lib/injuries.test.ts apps/mobile/src/models/ongoing-injuries.test.ts
rg -l -e '@/lib/injuries' -e 'src/lib/injuries' apps/mobile CLAUDE.md docs | xargs sed -i '' \
  -e 's|@/lib/injuries|@/models/ongoing-injuries|g' \
  -e 's|src/lib/injuries|src/models/ongoing-injuries|g'
```

### 5.2 The 4 misfiled hooks → `src/hooks/` (run before 5.3)

```
for NAME in use-ai-enabled use-ai-quota use-ai-connectivity use-social-enabled; do
  for EXT in ts test.ts; do
    [ -f apps/mobile/src/lib/$NAME.$EXT ] && git mv apps/mobile/src/lib/$NAME.$EXT apps/mobile/src/hooks/$NAME.$EXT
  done
  rg -l -e "@/lib/$NAME" -e "src/lib/$NAME" apps/mobile CLAUDE.md docs | xargs sed -i '' \
    -e "s|@/lib/$NAME|@/hooks/$NAME|g" -e "s|src/lib/$NAME|src/hooks/$NAME|g" || true
done
```

### 5.3 The domain list → `src/models/` (order matters: `up-next-target` before `up-next`; `workout-notification-model` moves while `workout-notification` the adapter stays — no rule exists for the adapter so no false rewrite is possible)

```
for NAME in active-workout-session ai-enabled ai-quota-cache catalog-loader create-pending-exercise \
            daily-name discard-workout exercise-catalog muscle-analysis muscle-development muscle-load \
            plate-math predict-next-workout set-consistency split-names up-next-target up-next \
            wear-state workout-action workout-conversion workout-notification-model workout-suggestions; do
  for EXT in ts test.ts; do
    [ -f apps/mobile/src/lib/$NAME.$EXT ] && git mv apps/mobile/src/lib/$NAME.$EXT apps/mobile/src/models/$NAME.$EXT
  done
  rg -l -e "@/lib/$NAME" -e "src/lib/$NAME" apps/mobile CLAUDE.md docs | xargs sed -i '' \
    -e "s|@/lib/$NAME|@/models/$NAME|g" -e "s|src/lib/$NAME|src/models/$NAME|g" || true
done
```

Moved-together relative imports survive (`exercise-catalog.ts` ↔ `./catalog-loader`, `create-pending-exercise.ts` → `./exercise-catalog`).

### 5.4 Fix the two cross-boundary relative imports (the only ones — verified)

`src/lib/ai-client.ts` L7–8: `'./ai-enabled'` → `'@/models/ai-enabled'`, `'./ai-quota-cache'` → `'@/models/ai-quota-cache'`.

### 5.5 STAYS in `src/lib/` (glue that is neither M, V, nor C — the honest name)

- Transport: `ai-client.ts` (+2 tests), `api-client.ts`, `api-client-core.ts` (+test), `app-check-token.ts` (+test), `firestore-rest-client-core.ts`, `firestore-rest-client.ts/.web.ts` (+2 tests + parity test).
- Platform adapters: `alert.ts`, `google-sign-in.ts/.web.ts`, `google-account-link.ts` (+tests), `google-sign-in-adapter.test.ts`, `google-sign-in-native-adapter.test.ts`, `live-update-notification-action-task.ts`, `live-update-notification-actions.{ts,android.ts,ios.ts}`, `streak-notification.{ts,native.ts}`, `streak-schedule.ts` (+test, kept beside its only consumer), `wear-sync.{ts,android.ts}`, `wear-action-task.ts` (+test), `widget-up-next.tsx` (+test), `workout-notification.{ts,android.ts,ios.ts}`, `workout-surface-sync.ts`, `platform-adapters.test.ts`, `platform-native-adapters.test.ts`.
- Utils: `date-key.ts` (+test), `firebase-errors.ts` (+test), `format-ai-error.ts` (+test), `muscle-map-scale.ts` (+test).

### 5.6 Docs

Re-read CLAUDE.md's "Mobile app" layout block and fix prose describing the old layout (path literals were already rewritten by the seds; prose like "src/lib/ non-UI helpers" needs rewording to describe models/views/controllers/lib). Mirror substantive edits to AGENTS.md if it duplicates the block.

### Verify

```
rg -n "@/lib/(active-workout-session|ai-enabled|ai-quota-cache|catalog-loader|create-pending-exercise|daily-name|discard-workout|exercise-catalog|injuries|muscle-analysis|muscle-development|muscle-load|plate-math|predict-next-workout|set-consistency|split-names|up-next|wear-state|workout-action|workout-conversion|workout-notification-model|workout-suggestions|use-ai-enabled|use-ai-quota|use-ai-connectivity|use-social-enabled)" apps/mobile
```

→ zero hits (remaining `@/lib/workout-notification`, `@/lib/workout-surface-sync`, etc. are correct — they stayed).

- `rg -n "src/lib/(injuries|active-workout-session|split-names)" apps/mobile` → zero.
- `ls apps/mobile/src/lib` — remaining set matches 5.5 exactly.
- `rg -n "mock.module\(new URL" apps/mobile | rg -v "src/(models|views|hooks|lib|context|config|constants)/|'\./|'\.\./"` → zero.
- Standard command list. Parity + platform-adapter tests green with no assertion edits.

---

## Phases 6–8 — Controller extractions

Shared constraint: `tests/screens/<screen>.test.tsx` passes **with zero edits** — it pins the behavior. Screen tests mock repositories by module path; extractions keep calling the same repository modules, so mocks keep applying. New-code test pattern: colocated `*.test.ts`, same style as `src/hooks/use-draft-exercises.test.ts`; use `tests/factories.ts` (`@/tests/factories`) for fixtures; copy repository mock patterns from the matching screen test.

### Phase 6 — analytics (`refactor/analytics-controller`)

1. **New `src/models/analytics-summary.ts`**: move the `useMemo` body at `app/(tabs)/analytics.tsx` L143–317 verbatim into `export function computeAnalyticsSummary(workouts: Workout[])`, including the `workouts.length === 0` early return. `export type AnalyticsSummary = ReturnType<typeof computeAnalyticsSummary>`.
2. **New `src/controllers/use-analytics.ts`**: `useAuth` → `useFocusEffect` → `workoutRepository.getHistory` → state, refreshed on `useDataVersion()`. Surface: `{ workouts, summary, loading }` with `summary = useMemo(() => computeAnalyticsSummary(workouts), [workouts])`.
3. **Screen**: replace the load effect + giant memo with `const { workouts, summary, loading } = useAnalytics();`. Formatters at L917–927 stay in the screen.
4. **Tests**: `analytics-summary.test.ts` (2 factory workouts → assert `favoriteExercise`, one `maxWeights` entry, empty-input return); `use-analytics.test.ts` (mock `src/models/workout-repository.web.ts` by path, render hook, assert load + summary).

### Phase 7 — pushup-challenge (`refactor/pushup-controller`)

1. **New `src/models/pushup-timeline.ts`**: move `buildTimeline` (L65), `isStreakAlive` (L114), `currentStreakLength` (L125) verbatim with their types; export all three.
2. **New `src/controllers/use-pushup-challenge.ts`**: state `{ data, loading, saving, restarting }`; actions `{ reload(), completeToday(): Promise<'already-done'|'completed'>, restart() }`. `completeToday` owns only the persistence half of `completeTodayPushups` (L468–534): date key, already-done guard, `pushupRepository` write, `triggerSyncAfterWrite`, streak-notification reschedule. **`Animated.timing` choreography stays in the screen.** If `tests/screens/pushup-challenge.test.tsx` pins the persist∥animate concurrency, have the action return the persistence promise and keep `Promise.all` in the screen — whichever keeps the screen test green unedited.
3. **Tests**: `pushup-timeline.test.ts` (timeline spans startDate→today; broken streak detected; consecutive-day count); `use-pushup-challenge.test.ts` (mock `src/models/pushup-repository.web.ts` by path; `completeToday` writes once, no-op second call).

### Phase 8 — active-workout (`refactor/active-workout-controller`)

1. **New `src/models/complete-workout.ts`**: pure `buildCompletedWorkout(input)` extracted from `finishWorkout` (`app/active-workout.tsx` L428–496): empty-label filtering, draft→`PerformedExercise` set mapping, plan-vs-adhoc branch. No I/O, no repository imports.
2. **New `src/controllers/use-finish-workout.ts`** (deliberately narrow — the screen's 22 useState stay put; draft state is already `use-draft-exercises`): one action `finishWorkout()` sequencing terminal guard → `getOngoingInjuryIds` (`@/models/ongoing-injuries`) → `buildCompletedWorkout` → `workoutRepository` write → `triggerSyncAfterWrite` → wear push (`@/lib/wear-sync`) → session teardown (`@/models/active-workout-session`). Returns `{ ok: true } | { ok: false, error }`. **Haptics and `router.replace` stay in the screen.**
3. **Screen**: `finishWorkout` becomes ~10 lines: call action; on success, haptics + navigate.
4. **Tests**: `complete-workout.test.ts` (filtering, set mapping, plan-vs-adhoc — pure, factory-driven); `use-finish-workout.test.ts` (mock `src/models/workout-repository.web.ts` + `src/models/sync-trigger.web.ts` by path; write happens once; terminal guard blocks second call).

---

## Appendix — remaining fat screens (one follow-up PR each, same guardrails)

Template: pure derivations → new `src/models/<x>.ts` + colocated test; the `useAuth → useFocusEffect → repo → triggerSyncAfterWrite → useDataVersion` orchestration → `src/controllers/use-<screen>.ts` + minimal test; haptics/animation/navigation stay in the screen; screen test passes unedited.

- `app/modal.tsx` → `use-workout-builder.ts`: name-options loading (already on `loadSplitNames` after P2) + `handleSave`/`handleDelete` orchestration.
- `app/(tabs)/index.tsx` → `use-home-up-next.ts`: the `useFocusEffect` L53–104 (history load, `predictNextWorkout`, planned queue, `describeUpNext`, watch push). Compute `describeUpNext` once and store it — deletes the L145 recompute.
- `app/settings-injuries.tsx` → pure `src/models/reconcile-injuries.ts` (`diffInjuries(next, shown, existingIds) → {create, update, softDelete}`, from persist() L82–93) + controller applying it via `injuryRepository`.
- `app/planned-workouts.tsx` → `src/models/planned-queue.ts` (AsyncStorage queue-order load/save) + controller.
- `app/settings-account.tsx` → `use-account-deletion.ts`; the `firebase/auth` SDK import moves into the controller.

## Verification summary (how to know the whole thing worked)

Per phase: `bun run typecheck && bun run test && bun run lint` + that phase's greps, all green, screen tests unedited (except sanctioned deletions in P1/P2). End state: `src/models` (data + domain logic), `src/views` (components), `src/controllers` (per-screen hooks), `src/lib` (transport + platform adapters + utils only), `app/` thin. `rg -n "@/data/|@/ui/" apps/mobile` → zero. `graphify update .` run after each phase.

## Critical files

- `apps/mobile/tests/setup.ts` — verified layout-agnostic; the reason the moves are safe; do not touch
- `tools/check-web-native-deps.js` (ENTRY_POINTS L24–32) + `tools/check-direct-boundaries.js` (L12) — must change in the P3 commit (the P3 sed covers both)
- `packages/contract/src/api-contract.ts` — P1 deletions with the corrected keep-list
- `apps/mobile/src/lib/split-names.ts` — the canonical implementation P2 converges on
- `apps/mobile/app/active-workout.tsx` — largest extraction (P8)
