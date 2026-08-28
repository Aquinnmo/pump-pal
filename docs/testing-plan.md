# Behavior-Locking Test Suite (pre-MVC-refactor)

## Context

A major structural refactor to an MVC layout is planned. The refactor must not
change behavior, and today nothing enforces that:

- **No CI at all.** No `.github/` directory exists. Every gate is manual.
- **No UI tests.** Zero `*.test.tsx` in the repo. 26 routes (~11,375 lines of
  screens) and ~36 components in `src/ui/` have no coverage.
- **The most fidelity-critical logic is untestable where it sits.** `finishWorkout`
  (`apps/mobile/app/active-workout.tsx:485`) — the function that strips
  uncompleted sets before the single DB write — is an unexported closure inside a
  1,189-line component. `docs/purpose.md` names this exact behavior as the thing
  that keeps wrong data out of the dataset. Only a screen-level test can lock it
  down without refactoring first.
- **Test registration is manual and already broken.**
  `apps/mobile/src/data/injuries.test.ts` is a real suite that no package.json
  script references, so it has never run.

The refactor will move logic out of those screens. Tests bound to internal module
paths would move with it and prove nothing. So the suite must be written against
**stable seams** — HTTP surface, repository interfaces, rendered output, and
contract schemas — which survive a file reshuffle.

## Scope at a glance

| Phase | What | Rough size |
|---|---|---|
| 0 | Migrate to `bun:test`, kill the manual script registry | 4 package.json files, ~35 scripts deleted |
| 1 | GitHub Actions CI (none exists) | 1 workflow file |
| 2 | UI harness: react-native-web + happy-dom + factories | 2 new files, 3 devDeps |
| 3 | Pure-logic gaps | ~35 new test files |
| 4 | API routes, contract schemas, Firestore rules | ~15 files extended/new |
| 5 | Component tests | ~32 new files |
| 6 | Screen tests | ~26 new files |
| 7 | Web/native repository parity | ~9 shared contract suites |
| 8 | `tools/` and static guardrails | ~6 new files |

Today: 61 test files, all pure logic, zero UI, zero CI.

## The one rule that makes this suite worth writing

**Assert on observable behavior at a seam that survives the refactor. Never on
internal structure.**

| Do | Don't |
|---|---|
| `app.request('/api/buddies', …)` returns 401 | `requireAuth()` was called |
| Render `active-workout`, uncheck a set, press Finish, assert the object passed to `workoutRepository.create` | import and call `finishWorkout` |
| `workoutRepository.getById(uid, id)` returns the row | a specific SQL string ran |
| `screen.getByText('Push Day')` is present | component tree shape / snapshot of JSX |

Corollary for the implementer: **do not change any source file to make it
testable.** If something cannot be tested where it sits, test it one level up
through the UI. Extraction is the refactor's job, not this task's. The single
exception is adding `testID`/`accessibilityLabel` props, which are inert.

## The second rule: found a bug? Lock it, don't fix it

Exploration already surfaced **29 real defects** without running a single test
(Appendix A). More will turn up. **Write the test to assert what the code does
today**, add a
`// BUG:` comment above it explaining what it *should* do, and file a bead. Do not
fix it in this work.

The reason is the whole point of the task: this suite exists to prove the refactor
changed nothing. A suite that encodes a mix of current and intended behavior can't
do that, and "is this a bug or a deliberate quirk?" is exactly the judgment call
that should come back to the user rather than be guessed at.

## Phase 0 — Runner migration (do this first, nothing else works without it)

Today all 61 tests are plain scripts (`node:assert/strict`, top-level asserts, run
as `bun <file>`) and each must be hand-registered in package.json. That registry
is how `apps/mobile/src/data/injuries.test.ts` ended up never running.

1. **Switch to `bun:test`.** It ships with bun — no new dependency. `bun test`
   auto-discovers `**/*.test.ts`, isolates each test, names failures, and provides
   `mock.module()`, which Phases 3–5 require.
2. **Replace the script chains** in all four package.json files with `bun test`
   (root `test` fans out to the three packages plus `test:tools`). Delete the ~35
   individual `test:*` entries.
3. **Existing files should keep working unchanged** — a top-level `assert` script
   throws during module evaluation, which `bun test` reports as a failed file. Do
   **not** rewrite the 61 existing files. **Verify this first**, before anything
   else: run `bun test packages/contract/src/` and confirm it reports pass/fail
   correctly, then temporarily break one assertion and confirm it goes red. If
   `bun test` reports "0 tests" and exits 0 on a broken file, stop and report back
   — the whole migration depends on this and it must not be assumed.
4. **Keep the node holdouts on node.** Only `apps/mobile/app.config.test.js` has a
   hard blocker (`require.cache` invalidation to re-evaluate the Expo config under
   different env). `live-activity-autolinking.test.js` shells out to
   `expo-modules-autolinking` via `execFileSync`. Leave all `*.test.js` files on
   `node` under `test:tools`-style scripts; exclude them from `bun test` discovery.
5. **Wire up what is currently orphaned:** `src/data/injuries.test.ts` (runs for
   the first time — expect it may fail), `test:firestore-rules`, and
   `check:direct-boundaries`.
6. **`bun:test` has no types here — you must add them.** `@types/bun` is
   **deliberately not installed**: it redeclares `fetch`/`Request` globally and
   collides with the react-native globals under `apps/mobile`'s
   `types: ["node", "react"]`. Do **not** add it — that is a trap that will look
   like the obvious fix and will break `bun run typecheck` across the mobile
   package. Instead hand-write a minimal ambient declaration for `bun:test`
   (`describe`/`it`/`test`/`expect`/`beforeEach`/`afterEach`/`mock`), following the
   existing precedent at `apps/mobile/src/data/bun-sqlite.d.ts`, which does exactly
   this for `bun:sqlite` and explains the reasoning in its header comment.
7. **Update `CLAUDE.md`.** Its line warning that `bun test` "discovers/runs
   `*.test.*` files directly instead of the aggregate script" becomes wrong —
   auto-discovery is now the point. Also fix the stale "three holdouts" claim:
   there are five `.js` node tests in `apps/mobile` alone, and the stated
   `require.cache` reason applies to exactly one of them.

**Gate:** `bun run test` passes and its file count is ≥ 61.

## Phase 1 — CI (second, so every later phase is enforced)

Create `.github/workflows/ci.yml`. Nothing exists today.

- Trigger: `pull_request` + `push` to `main`.
- `oven-sh/setup-bun`, `bun install --frozen-lockfile`.
- Steps, each its own named step so failures are legible: `bun run typecheck`,
  `bun run lint`, `bun run test`, `bun run test:firestore-rules`.
- The rules step needs Java + the Firestore emulator; `firebase-tools` is already
  a root devDependency. Cache `~/.cache/firebase/emulators`.
- **Do not** add a build/export step — repo rules forbid `bun run build:web` and
  `expo export` as verification.

## Phase 2 — UI test harness

The web bundle already ships every one of these components through
`react-native-web` to Vercel, so DOM rendering is a real target, not a simulation.

Add as devDependencies: `@happy-dom/global-registrator`, `@testing-library/react`,
`@testing-library/user-event`. (`@testing-library/dom` and `user-event` are already
in `node_modules` as transitive deps of `expo-router`, but must become direct.)

Create **`apps/mobile/tests/setup.ts`**, preloaded from a **new
`apps/mobile/bunfig.toml`** — *not* the workspace-root one:

```toml
# apps/mobile/bunfig.toml
[test]
preload = ["./tests/setup.ts"]
```

Putting this in the root `bunfig.toml` would register happy-dom globals for the
`apps/api` and `packages/contract` suites too. Those run against workerd/Node
semantics and a DOM `fetch`/`Request` shadowing theirs will break them. Keep the
root `bunfig.toml` to its existing `[install] linker = "hoisted"` block.

It must do four things, in this order:

1. `GlobalRegistrator.register()` from `@happy-dom/global-registrator`.
2. A `Bun.plugin` resolver that maps `react-native` → `react-native-web`.
3. **Platform-extension resolution** — `.web.ts(x)` before `.ts(x)`. This is not
   optional: 19 files have platform variants (`profile-repository.web.ts`,
   `use-color-scheme.web.ts`, `injuries.web.ts`, …) and without it the tests
   silently exercise the native file. **Copy the resolution order verbatim from
   `tools/check-web-native-deps.js:60-70`**, which already implements exactly this
   (`.web.ts`, `.web.tsx`, `.ts`, `.tsx`, `index.web.ts`, `index.ts`).
4. Default module stubs for what has no web implementation: `expo-router`
   (`router.replace`/`push` as spies, `useSegments`, `useLocalSearchParams`,
   `useFocusEffect`), `expo-haptics`, `expo-notifications`, `expo-sqlite`,
   `@react-native-async-storage/async-storage` (in-memory `Map` — copy the pattern
   already in `src/lib/ai-quota-cache.test.ts`), `@notifee/react-native`,
   `react-native-reorderable-list`, `@react-native-community/netinfo`.

Also create **`apps/mobile/tests/factories.ts`** — builders for `Workout`,
`PerformedExercise`, `DraftExerciseRow`, `CatalogExercise`, `Injury`, `UserDoc`,
each taking a partial override. Every later phase uses these. There is no fixture
directory today; this is new.

**Gate:** one throwaway test renders `<ThemedText>hello</ThemedText>` and
`screen.getByText('hello')` succeeds.

### Known risks, stated up front

- Some components may need extra stubs (`react-native-svg`,
  `react-native-gesture-handler`, `expo-linear-gradient`). All three ship web
  builds and are already in the Vercel bundle, so try unstubbed first and only
  stub what actually throws.
- `react-native-reanimated` v4 depends on worklets and may not initialise under
  happy-dom. Only `hello-wave.tsx` and the root layout import it — stub it if it
  fights back rather than sinking time into it.
- If a specific screen proves genuinely unrenderable after a real attempt, record
  it in a "deferred" list in the PR rather than deleting the test or, worse,
  changing the source to accommodate it.

## Cross-cutting: test isolation (read before writing any test)

This codebase uses module-level mutable singletons in **22 places**. Under
`bun test`, module state persists across every test in a file and across files
sharing a module registry. Tests that pass alone will fail in the suite, or worse,
pass in the suite for the wrong reason.

**Every test touching one of these must reset it in `beforeEach`/`afterEach`:**

| Module | State | Reset |
|---|---|---|
| `src/lib/active-workout-session.ts` | `session`, `listeners` | `endSession()` + unsubscribe |
| `src/lib/ai-quota-cache.ts` | `entry` | `clearAIQuotaCache()` |
| `src/lib/app-check-token.ts` | `provider` | re-register |
| `src/data/sync-trigger.ts` | `getUids`, `initialSync`, `initialSyncUid`, `started`, `appStateSubscription`, `netInfoUnsubscribe`, `lastConnected` | `stopSyncTriggers()` + reconfigure |
| `src/data/client.ts` | `dbPromise` | fresh `openTestDb()` |
| `src/data/data-version.ts` | `version` | counter is monotonic — assert deltas, never absolute values |
| `src/lib/workout-notification.android.ts` | `useLiveUpdate` | — |
| `src/lib/workout-notification.ios.ts` | 3 `warnedAbout*` flags | one-shot warnings only fire once per process |
| `src/lib/live-update-notification-actions.ios.ts` | 4 pending/native vars | clear the timer too |
| `apps/api/src/runtime-env.ts` | `bindings` | `configureRuntimeEnv(env)` per test, **sequential only** |
| `apps/api/src/store/rest.ts` | `cachedToken` | a stubbed `fetch` is not re-hit after the first success |

Two more traps in the same family:

- **Timers.** `active-workout.tsx` has a 1s notification debounce and a 1s elapsed
  ticker; `modal.tsx` has a 500ms artificial minimum and a 500ms debounce;
  `social.tsx` has a 300ms search debounce. Use fake timers and flush them, or the
  tests are slow and flaky.
- **The clock.** `injuryCoversDate`, `todayUTC`, `toDateKey`, streak math, and
  `startSession` all read `new Date()` / `Date.now()`. Freeze it. And set a
  **non-UTC `TZ`** for anything date-key related — under UTC those tests pass
  regardless of whether the code is right.

### There are three different definitions of "today"

This is the single most likely place for the refactor to introduce a silent bug,
because the three look interchangeable and are not:

| Definition | Where | Used by |
|---|---|---|
| **Local** calendar day | `src/lib/date-key.ts` `toDateKey` | pushup challenge day keys, Social "trained today" |
| **UTC** day | `src/lib/daily-name.ts` `utcDate()` | daily-name cache key |
| **UTC** day | `src/lib/ai-quota-cache.ts` + `store/quota.ts` `todayUTC` | AI quota rollover |

Write a test for each that pins which one it is, under a non-UTC `TZ` at a time of
day where local and UTC disagree. If the refactor consolidates these, these tests
are what tell you it changed behavior.

### Logic that exists in more than one copy

Test each copy separately and assert they agree — a refactor that de-duplicates
them is exactly the change this suite needs to catch:

- The `'Other'` split → AI names + AsyncStorage cache block appears **four times**:
  `src/lib/split-names.ts`, `app/active-workout.tsx`, `app/modal.tsx`,
  `app/planned-workouts.tsx`.
- `flattenSets`/`nextSetIndex` in `src/lib/wear-state.ts` is re-implemented
  **differently** inside `src/lib/workout-notification-model.ts` — the second copy
  lacks the blank-row filter.
- `injuryCoversDate` is duplicated verbatim in `src/lib/injuries.ts` and
  `src/lib/injuries.web.ts`.
- Epley 1RM (`weight * (1 + reps/30)`) is inline in `app/(tabs)/analytics.tsx` and
  in `src/lib/muscle-development.ts` `setPerformance` — **with different guards**
  (`!bodyweight && weight > 0 && reps > 0` vs just `!bodyweight`).
- `slugify` has three copies (`src/lib/exercise-catalog.ts`,
  `apps/api/src/store/catalog.ts`, `tools/catalog/review-pending-exercises.js`).
- Scroll-fade logic is duplicated across `FadingScrollView`, `analytics.tsx`, and
  `settings.tsx`.

## Phase 3 — Pure-logic gaps (highest value per line, no harness needed)

These are exported, pure, and untested. Write these before touching UI — they are
cheap and they catch the most.

### 3a. `src/lib/muscle-analysis.ts` → `computeMuscleVolume` — **untested, and it is the flagship insight engine** (`docs/purpose.md` "deterministic-first rule")

| Case | Expected |
|---|---|
| `exerciseId` not in catalog | **no attribution at all** — not a guess, not a partial. The fidelity rule. |
| `variationId` set but variation missing from catalog | falls back to the parent exercise's muscles |
| `variationId` present and matching | variation muscles **override** parent entirely |
| `variationId: null` vs `undefined` | both must take the parent path (`!= null` check) |
| exercise with empty primary **and** secondary | skipped entirely |
| `sets: []` or `sets: undefined` | skipped (`setCount === 0`) |
| primary vs secondary weighting | 1.0 vs 0.5 per set |
| return shape | one row for **every** id in `MUSCLES`, `weeklySets: 0` for untrained — this is deliberate, to surface neglect. Assert the full length. |
| `weeklySessions` | distinct workout ids ÷ `WEEKS_IN_WINDOW` (30/7 ≈ 4.2857) — assert the real fraction, not a rounded one |
| `avgRpe` | `null` when no set recorded one; mean over only the sets that did |
| RPE + secondary muscles | the **full** `rpeSum`/`rpeCount` is added to every muscle the exercise touches, primary and secondary alike. Lock this as-is. |
| `topExercises` | top 3 by contributed effective sets, descending |
| unnamed exercise | `exerciseLabel(pe).trim()` may be `''` — assert what actually happens |

Also `normalizeMuscleInsights`: trims, drops empties, drops anything starting
`"all good"` case-insensitively, caps at 3, and tolerates `undefined` lists.

### 3b. `src/lib/injuries.ts`

- `injuryCoversDate` — boundaries are **inclusive** on both ends (`>=`, `<=`).
  Test exactly-on-onset and exactly-on-resolved.
- Unresolved injury uses `new Date()` as the end. **Freeze the clock** or the test
  is time-dependent.
- `toDateObj` returning null on either end → `false`.
- `getOngoingInjuries` swallows *any* repository throw and returns `[]`. Test the
  throwing path explicitly — silent failure is the risky part.
- Only `status === 'ongoing'` survives; `resolved` is excluded.
- `applyInjuryToHistory` skips workouts with no `date` (planned/in_progress),
  dedupes via `Set` so re-applying is idempotent, returns the count stamped.
- `removeInjuryFromHistory` only touches workouts that carry the id; returns count.

### 3c. `src/lib/date-key.ts` → `toDateKey`

Fourteen lines, and its whole reason for existing is that
`toISOString().slice(0,10)` is wrong. **Run these with an explicit `TZ`** (`TZ=America/Los_Angeles bun test …`,
or set `process.env.TZ` before import) — tested under UTC it proves nothing:

- `2026-01-01T05:00:00Z` in `America/Los_Angeles` → `"2025-12-31"` (previous year)
- `2026-08-27T23:30:00Z` in `Asia/Tokyo` → `"2026-08-28"` (next day)
- zero-padding: January → `"01"`, day 5 → `"05"`
- a DST-transition day in a DST zone

### 3d. Remaining untested `src/lib/` and `src/data/` modules

Baseline for each: empty input, single element, `null`/`undefined` optional fields,
and the error path. Ones with a specific trap:

- **`predict-next-workout.ts`** — 0 names → null; 1 name → that name; filters to
  `(!status || status === 'completed') && splitNames.includes(name) && date != null`;
  sorts **ascending**; scans **backwards from `length-2`** skipping back-to-back
  repeats; falls back to round-robin, or `splitNames[0]` when the anchor is not in
  the split.
- **`split-names.ts`** — the AsyncStorage cache key is
  `pumppal_split_names_v2_{normalized.slice(0,60)}`, so **two different custom
  descriptions agreeing in their first 60 normalized chars collide**. Malformed
  cached JSON is swallowed and leaves the preset (`[]` for `'Other'`).
- **`daily-name.ts`** — keyed on the **UTC** day, unlike the challenge. Any throw
  returns `'buddy'`. A cached empty string is falsy and re-fetches. Never prunes.
- **`ai-enabled.ts`** — **every** unknown resolves `false` (no uid, no row, thrown
  read, absent field). The deliberate inverse of `use-ai-quota`'s `null`.
- **`ai-client.ts`** — check order is signed-in → `isAIEnabled` → connectivity →
  base URL → App Check → fetch. Assert `AIDisabledError` is thrown **before any
  request** — that is what covers `loadSplitNames` and `getDailyName`, which have
  no UI to hide behind. Also: the network-failure message is
  `Could not reach ${url}: …`, and `initial-sync.ts`'s offline regex keys on the
  word `reach` — a reworded message silently breaks offline detection. Pin it.
- **`use-ai-connectivity.ts`** — unknown connectivity (`null`) counts as
  **available**, and web is always `true`.
- **`exercise-catalog.ts`** — `rankSearchOptions` has 6 ranking tiers; the
  **empty-query path returns everything** sorted by recent-index then alphabetically.
  `buildSearchOptions` emits one option per exercise **plus one per variation**.
- **`streak-schedule.ts`** — `nextFireAt` skips to tomorrow when the hour has passed
  (`t <= now`, inclusive). `dayNumberOn` compares **UTC midnights** so DST cannot
  shift it — this is the correct reference implementation, unlike
  `pushup-challenge.tsx`'s inline `buildTimeline`.
- **`discard-workout.ts`** — `queueOrder !== undefined` restores to `'planned'`
  with `completed` stripped and `startedAt` deleted; otherwise `softDelete`.
- **`muscle-map-scale.ts`** — pure hex interpolation, clamps 0–100. Trivial.
- **`widget-up-next.tsx`** — per-field `||` fallback; **not uid-keyed**, which is
  why `account-data.ts` purges it explicitly.

Also untested: `up-next-target.ts`, `create-pending-exercise.ts`, `alert.ts`,
`app-check-token.ts`, `google-sign-in.ts`, `streak-notification.ts`,
`wear-sync.ts`, `workout-notification.ts`, `live-update-notification-actions*.ts`,
`firestore-rest-client-core.ts`, plus `src/data/`: `account-data.ts`, `purge.ts`,
`sync.ts`, `sync-trigger.ts`, `version-cache.ts`, `web-direct-firestore.ts`,
`id.ts`.

### 3e. `useDraftExercises` (`src/hooks/use-draft-exercises.ts`) — via `renderHook`

The shared editing engine behind both `modal.tsx` and `active-workout.tsx`.
`docs/purpose.md` names its autofill and cascade as core ingestion behavior.

- `trackCompletion: false` must produce sets with **no `completed` key at all** —
  not `completed: false`. Assert with `'completed' in set === false`. Getting this
  wrong writes a stray field into every planned/logged doc.
- `selectExercise` prefers the most recent workout **with the same name**, then
  falls back to any workout. Test with history where a same-name match is *later*
  in the array than a different-name match.
- Match requires `exerciseId` **and** `variationId` to be equal — including
  `null === null`.
- Autofilled sets always reset `completed: false`, even when the source history
  had them completed.
- No history match → keeps the existing row's sets, only swaps the identity fields.
- `toggleBodyweight` clears `weight` on **every** set, not just the current one.
- `removeSet` is a no-op when only one set remains.
- `addSet` clones the last set but resets `completed`.
- `updateSet`: `durationSeconds` clamps at 59; `Number('')` and `Number('abc')`
  both fall to `0` via `|| 0`; `weight` stays a raw string (no numeric coercion).
- `bumpReps` floors at 0 — decrement past zero must not go negative.
- First match wins in `findLastPerformed`, so the hook **assumes history is
  newest-first**. Write a test that documents that assumption.
- All mutators are **index-based**, so a concurrent reorder invalidates in-flight
  indices. Pin the current behavior.

### 3f. Constant invariants (three cheap tests, high leverage)

- `MUSCLE_REGIONS` (6 regions) must cover all 27 `MUSCLES` exactly once —
  exhaustive and non-overlapping.
- Every muscle in `BODY_PART_MUSCLES` must be a member of `MUSCLES`.
- `SPLIT_WORKOUT_NAMES` must have a key for every `SPLIT_OPTIONS` entry, and
  `'Other'` must map to `[]` — that empty array is what routes `'Other'` to the AI
  path, so a "helpful" default there would silently disable it.

### What is already well covered — do not redo it

These have real suites already. Read them before writing anything nearby, and
extend rather than duplicate: `sync-engine` (615 lines), `api-client` (443),
`outbox` (290), `workout-conversion`, `muscle-load`, `muscle-development`,
`set-consistency`, `plate-math`, `wear-state`, `workout-notification-model`,
`workout-action`, `catalog-loader`, `migrate`, `workouts`, `keyed-mutex`,
`firebase-errors`, `google-account-link`, `format-ai-error`, `ai-quota-cache`.

## Phase 4 — API, contract, rules (stable seams, cheapest to lock)

### 4a. `apps/api/src/worker.ts` — 13 live routes + 8 tombstones; existing tests exercise 5 paths

`createWorkerApp(verifyUid, verifyAppCheck)` takes **both** seams by injection —
that is the existing harness. Extend `worker.test.ts`; do not build a second one.

> **`configureRuntimeEnv` is module-global mutable state.** Two tests passing
> different `env` objects race. Keep Worker tests sequential — do not reach for
> `test.concurrent`.

Untested routes: `GET /api/buddies/search`, `POST /api/buddies`,
`POST /api/buddies/:uid`, `POST /api/buddies/:uid/chop`,
`POST /api/injuries/:id/apply-to-history`,
`POST /api/injuries/:id/remove-from-history`, `POST /api/catalog/pending`
(returns **201**, not 200), `DELETE /api/account/data`, `GET /api/ai/quota`.

Per route: 401 without a token, 403 for a denied `Origin`, 400 on malformed input,
and error responses **still carry CORS headers** (without them the browser hides
the real status — the existing test explains why).

Ordering invariants that are easy to break and invisible without a test:

- **Origin denial precedes auth.** A bad origin gets 403 `origin_denied`, never 401
  — and that applies to `/health` too.
- **Bad ID token beats App Check.** `verifyUid` runs first, so an invalid token
  gives 401 `'Invalid or expired session'`, not `app_check_failed`.
- **A native call sends no `Origin`**, skips CORS entirely, gets no CORS headers,
  and is allowed even with `API_ALLOWED_ORIGINS` unset.
- App Check `monitor` mode warns and passes; `enforce` throws 401 `app_check_failed`.
  The failure `reason` must **not** appear in the response body.
- Logs must contain no bearer token, uid, or request body.

**All 8 tombstones must return `410 client_upgrade_required`** — and each live
route must still win over them. `GET /api/profile` is a tombstone while
`PATCH /api/profile` is live; `app.all('/api/injuries/:id')` is a tombstone sitting
below two live `/api/injuries/:id/*` routes. CLAUDE.md says "do not add a tombstone
above a real route"; a test per tombstone plus a test per live route is what makes
that enforceable rather than aspirational.

`403 ai_disabled` on both AI routes: `isAIEnabledField` is `value === true`, so
absent, `null`, `false`, `"true"`, and `1` must **all** be refused.

`POST /api/ai` control flow is order-dependent and worth a test each: unknown op →
400; input parse failure → 400 with the op name in the message; `ai_disabled` →
403 (checked *after* parsing); `daily-name` returns a cached name **without
spending quota**; a provider throw after `consumeQuota` triggers `refundQuota`.

### 4b. `packages/contract/`

`username.test.ts` is **8 lines** for a validator gating a user-visible unique
identifier. Expand to cover `USERNAME_REGEX` (`/^[A-Za-z][A-Za-z0-9_]{2,19}$/`:
3–20 chars, must start with a letter) at both boundaries — 2, 3, 20, 21 chars — a
leading digit, a leading underscore, a hyphen, whitespace-only, and `''`. For
`slugifyUsername`: non-ASCII (`'Ünïcödé'`, `'日本'`), a string that slugifies to
under 3 chars (→ `'athlete'`), and the truncation case where `.slice(0,20)` runs
**after** the trailing-underscore trim and can put one back.

For `api-contract.ts` and `ai-contract.ts`, every schema needs both directions: a
valid payload parses, and each constraint rejects when violated. Traps:

- **Zod objects are non-strict.** Extra keys are stripped, never rejected. That is
  what makes `profilePatchInput.parse({uid: 'someone-else'})` safe — assert the key
  is *absent from the result*, not that parsing threw.
- `custom` on `workoutSplit` is `.nullable()` but **not** `.optional()` — the key
  must be present. Same for `variationId`/`variationNameSnapshot` on
  `performedExercise`, and all five keys of `profileDTO`.
- `updateWorkoutInput.baseVersion` is **required**; `updateInjuryInput.baseVersion`
  is **optional**. Easy to get backwards.
- `createInjuryInput.status` has `.default('ongoing')` — optional in, required out.
- `isoTimestamp` is `.datetime({offset:true})`: accepts `Z` and `+05:00`, rejects a
  bare `2026-08-12T00:00:00` and a plain `2026-08-12`.
- `buddyUid` is `/^[A-Za-z0-9]+$/` — **rejects `-` and `_`**.
- `localDate` is a shape regex only: `'9999-99-99'` and `'0000-00-00'` parse.
- `catalogResponse.exercises` is `.min(1)` so an empty snapshot can never replace a
  cached catalog. Assert the rejection.
- `workoutStatus` is `planned|in_progress|completed` — **not** `'active'`.

`directProfilePatchInput` is the security-relevant one: it must accept **only**
`workoutSplit`, `aiEnabled`, `socialEnabled`, `baseVersion`. That allowlist is
duplicated in `firestore.rules` and in the `updateMask` in
`src/data/firestore-sync-remote.ts`. **Add one test asserting all three agree** —
they can drift silently today.

`firestore-rest.ts` is a shared codec and deserves round-trip tests: `null` and
`undefined` both encode to `{nullValue:null}`; non-finite numbers throw; a bare
`Date` **throws** (`ts()` is mandatory); `-0` encodes as `{integerValue:'0'}`;
`integerValue` beyond `Number.isSafeInteger` throws on decode; and encode→decode
is **not** an involution for timestamps (a `timestampValue` decodes to a string,
which re-encodes as `stringValue`).

### 4c. `tests/firestore.rules.test.ts`

Already good (~48 assertions) but not in the default `test` chain — Phase 1 fixes
that. Untested rules paths to add:

- `exerciseCatalogMeta/current` and `random/{dateKey}` — signed-in read, no write.
- `users/{uid}` **`list` is `allow list: if false`** — denied even for the owner.
- `injuries` `bounded()` at exactly 200 (allowed) vs 201 (denied).
- `validSplit` requires `updatedAt is timestamp`; `validWorkout` requires
  `schemaVersion == 2`; both use `hasOnly`, so an unknown key must be rejected.
- `private/notifications` is **write-only** — the owner can never read the token
  back. `private/aiUsage` is **read-only** — only the service account writes.
- `create` on `users/{uid}` checks `request.resource.data.keys().hasOnly(...)` while
  `update` checks `diff().affectedKeys().hasOnly(...)`. So a create carrying
  server-written `username` is denied, but an update alongside an existing
  `username` is fine. Test both — the asymmetry is deliberate and load-bearing.
- `validUserFields` on update inspects the **merged** doc, so a doc with a legacy
  invalid `workoutSplit` bricks every future owner write. Lock this behavior.
- `workouts` `list` needs `where('userId','==',uid)` **and** `limit(1..200)`.

### 4d. `apps/api/src/store/`

- **`rest.ts` `updateMask`** — the header comment says omitting it makes `:commit`
  replace the whole document, but the code is `w.updateMask ?? []`, which sends an
  *empty* mask. Test what actually happens and record which reading is right. Then
  assert every write helper passes a correct non-empty mask. This is the
  highest-consequence invariant in the package.
- **`commit` only tags HTTP 409.** Firestore returns 400 `FAILED_PRECONDITION` for
  a stale `updateTime`, which falls into the generic branch and becomes an untagged
  500. Every retry loop in `quota.ts`, `injuries.ts`, `buddies.ts`, `profile.ts`
  keys on `status === 409`. **Verify this before writing assertions** — if it holds,
  those retry paths are dead code and that is a significant finding.
- `runQuery` drops `limit: 0` (truthiness check) → unbounded query.
- `getAccessToken` caches at module scope and survives across tests; a stubbed
  `fetch` will not be re-hit after the first success. Reset between tests.
- **`quota.ts`** — `nextUsage` rollover is date-string *equality*, so a
  future-dated record also resets to 0. `consumeQuota` claims **before**
  generation, retries up to 3 on 409, and throws 429 at the cap. `refundQuota`
  refuses to cross UTC midnight and **swallows every error** — test the silent
  path explicitly. `quotaStatus` clamps at 0 for a lowered cap.
- **`account.ts`** — `deleteAccountDataWith(uid, phases)` is the injectable seam.
  Assert phase **order** (username reservation must run first, it reads
  `usernameLower` off the user doc), that each phase's failure sets `partial` and
  does not abort the rest, that injuries and privateDocs **share one try** so an
  injuries failure skips privateDocs, and that it always returns 200.
- **`buddies.ts`** — `pairId` escaping is injective; `isSocialEnabledField` is
  `v !== false` (**absent = enabled**, the opposite polarity to `aiEnabled` —
  test both so the asymmetry is pinned).

## Phase 5 — Component tests (`apps/mobile/tests/ui/`)

Bottom-up: get the leaves passing before attempting a screen. One file per
component. **Query by user-visible text or accessibility role, never by class name
or component-tree position** — that is what makes these survive the refactor.

**Tier 1, few/no native deps — start here:** `themed-text`, `themed-view`,
`muscle-map-legend`, `muscle-load-summary`, `muscle-insight-cards`,
`set-consistency-summary`, `development-progress`, `development-progress-summary`,
`analytics-navigation-row`, `workout-prefill-loader`, `toast`, `collapsible`,
`timber-logo`, `timber-tab-icon`, `fading-scroll-view`.

**Tier 2, interactive:** `plate-calculator`, `dropdown`, `date-field`,
`exercise-picker`, `workout-card`, `workout/set-fields`, `workout/exercise-card`,
`workout/focus-view`, `drag-handle`, `google-sign-in-button`, `timber-auth-shell`,
`parallax-scroll-view`, `muscle-map`, `muscle-load-map`, `haptic-tab`,
`external-link`, `icon-symbol`.

For each component, cover **all four** of these, not just the happy path:

1. **Empty** — `[]`, `null`, `undefined`, `0`, `''` for every list/optional prop.
2. **Loading** — the spinner/skeleton branch renders and the content branch does not.
3. **Error** — the error message renders and is user-legible.
4. **Interaction** — the callback fires with the exact arguments, and fires
   **once** per press (double-tap must not double-fire on the guarded ones).

Component-specific traps worth naming:

- `plate-calculator` — reuses `solvePlates`, which is already well tested. Test the
  *presentation*: bodyweight rows and `Sets of Duration` rows suppress the plate
  UI entirely (see the `plateWeightPrefillable` condition in `active-workout.tsx`),
  and an empty weight string shows nothing rather than a zero-plate solution.
- `exercise-picker` — recents-for-this-day are offered **before** search results
  (`docs/purpose.md` lists this as ingestion behavior). Test with a query that
  matches both.
- `set-fields` — reps/weight/duration inputs, and the completion checkbox.
- `workout-card` — swipe/gesture affordances, and a workout with zero exercises.
- `dropdown` / `date-field` — closed by default, opens on press, selection fires
  once, dismiss without selecting fires nothing. `dropdown` keys options by the
  string itself, so **duplicate option strings** produce a React key warning and
  highlight both rows.
- `muscle-map` — an unknown `MuscleId` must not crash the SVG render. It
  self-hit-tests via `muscleAtPoint`, so a tap on a neutral tile or off-body
  resolves `null` and must be ignored.
- `toast` — `if (!visible) return null` means it unmounts, so the exit animation
  never plays; and its 3s timer is re-created whenever `onHide` identity changes,
  which every call site does with an inline arrow. Lock both.
- `themed-text` / `themed-view` — both colour schemes via `use-color-scheme`. Note
  `src/constants/theme.ts` is effectively **dead**: every screen hardcodes
  `#0f0f0f`/`#e54242`/`#1c1c1c`, and the only readers of the theme
  (`themed-text`, `themed-view`, `collapsible`) appear in no route. Test them
  anyway — the refactor may well wire them up.
- `muscle-load-summary` — `fetchCatalog` has **no try/catch** and never resets
  `catalog`, unlike the otherwise-identical `development-progress-summary`.
- `drag-handle` — `useReorderableDrag()` **throws** outside a reorderable list's
  `renderItem`. Test it inside one.
- `exercise-picker` — selection compares `value === item.label` (**label equality,
  not id**), so two variations sharing a label both check. Search results are
  ranked by `rankSearchOptions` and then **re-sorted alphabetically**, discarding
  the ranking. `handleCreate` with no `onCreateNew` falls back to a sentinel
  (`exerciseId: 'under-review'`).

## Phase 6 — Screen tests (the ones that actually guard the refactor)

This is where the value is. The logic the MVC refactor will extract lives inline in
these files today and is reachable **only** through rendering.

Mock at the **repository boundary** (`@/data/*-repository`, `@/data/remote/*`) and
at `@/context/auth-context`. Do not mock anything inside `src/lib/` — that is the
logic under test.

### 6a. `active-workout.tsx` (1,189 lines) — highest priority in the entire plan

`finishWorkout` is an unexported closure. Render the screen, drive it, and assert
what lands on the mocked `workoutRepository`.

- **Uncompleted sets are stripped.** Three sets, check two, Finish → the object
  passed to `workoutRepository.create` has exactly two sets. `docs/purpose.md`
  calls this the guarantee that "nothing enters the dataset the user didn't
  affirm." **This is the single most important test in this plan.**
- The `completed` key is **removed** from every persisted set, not set to `false`.
- An exercise whose sets are all unchecked is dropped entirely
  (`.filter(pe => pe.sets.length > 0)`).
- Rows with a blank `label` are dropped before that.
- `order` is reassigned by post-filter position, so dropping row 0 must renumber.
- **Nothing is written to the DB before Finish.** Type into several sets, assert
  zero repository writes. The in-memory-only session is deliberate.
- `planId` present → `workoutRepository.update` on the existing row; absent →
  `create`. A `planId` whose row no longer exists throws "Workout no longer exists."
- **Double-finish guard:** `terminalRef` blocks a second press; on error it resets
  to `false` so a retry is possible. Test both halves.
- Finishing with incomplete sets shows the confirmation dialog first; finishing
  with none goes straight through (`handleFinishPress`).
- Ongoing injuries are stamped onto the saved workout; `getOngoingInjuryIds`
  throwing yields `[]` rather than failing the save.
- On save failure: the alert shows, `router.replace` is **not** called, and the
  session is not ended — the user's data must still be on screen.
- Android hardware back from editor-reached-from-focus returns to focus rather
  than popping the route.
- `focusUsable` falls back to the editor when every row has been emptied.

### 6b. `app/_layout.tsx` — the redirect table

`decideAccountBootstrap` is already pure and tested; the **wiring** is not. Assert
the final route for each combination of (`loading`, `user`, `onboardingSeen`,
`accountGate.state`/`step`, current segment):

| State | Expected |
|---|---|
| logged out, onboarding unseen | `/(auth)/welcome` |
| logged out, onboarding seen | `/(auth)/sign-in` |
| logged in, gate `onboarding` step `username` | `/set-username` |
| logged in, gate `onboarding` step `split` | `/set-split` |
| logged in, gate `ready`, currently in `(auth)`/`set-split`/`set-username` | `/(tabs)` |
| logged in, gate `ready`, already in `(tabs)` | **no redirect** |
| `loading` true, or `onboardingSeen === null`, or gate `pending` | **no redirect**, boot overlay visible |
| gate `error` | error overlay with a working "Try Again" |

Also: already being on the target route must not re-redirect (infinite-loop guard),
and `subscribeAccountDataChanged` firing must re-run the decision — the comment at
`_layout.tsx:39` says a stale decision bounces the user back to `/set-split`, so
that is a real regression this test catches.

Four non-obvious properties of this gate, each worth its own test:

- **Logged out is `{state:'ready'}`**, not a separate state. The `!user` branch is
  what handles it.
- **A cached profile with both split and username short-circuits the sync entirely**
  — the app opens fully offline without a network call. Assert no sync is attempted.
- **`onboardingSeen` starts `null` and the whole gate blocks on it**, and the
  `AsyncStorage.getItem(...).then(...)` has **no `.catch`**. An AsyncStorage
  failure leaves the boot overlay up forever. Lock this and file it.
- **An `auth-transition` outcome leaves the gate at `pending` forever** until the
  next `retryAttempt` bump — the boot overlay never clears on its own.

`hasSplit` is `isSplitOption(profile?.workoutSplit?.type)`, so an **unrecognised
split string counts as no split**; `hasUsername` is a truthiness check, so an
**empty-string username counts as missing**. Test both.

### 6c. `(tabs)/index.tsx` — Up Next priority chain

Priority is live session > head of planned queue > predicted name. Test each tier
and the transitions between them.

- A live session belonging to a **different uid** must be ignored.
- No live session → `dismissWorkoutNotification()` is called (clears a
  force-quit orphan).
- A live session → the watch state is **not** overwritten (the comment at
  `index.tsx:~103` explains overwriting loses the user's place).
- Planned queue sorts by `queueOrder`; `undefined` sorts last via `?? Infinity`.
- Empty history, empty queue, and no split all render something sane.
- The elapsed-time ticker formats h/m/s and clamps at 0 for a future `startedAt`.
- The repository throwing still clears `loading` (the `finally`).
- Refresh-on-focus must **not** flash the spinner (`setLoading(true)` is
  deliberately absent from the focus effect).

### 6d. Remaining screens

`(tabs)/analytics.tsx` (1,324), `(tabs)/pushup-challenge.tsx` (1,274),
`modal.tsx` (1,037), `settings-account.tsx` (671), `(tabs)/social.tsx` (575),
`settings-app.tsx` (565), `(auth)/phone-auth.tsx` (551), `planned-workouts.tsx` (518),
`settings-injuries.tsx` (464), `(tabs)/workouts.tsx` (371), plus the smaller
`(auth)/*`, `set-split`, `set-username`, `settings-*`, `up-next`,
`muscle-load`, `development-progress`.

Baseline for every screen: renders with empty data, renders with populated data,
renders the loading state, renders the error state, and its primary action fires.

Screen-specific traps:

- **`pushup-challenge`** — `buildTimeline`, `isStreakAlive`, `currentStreakLength`,
  `formatDate`, `formatTime` are all **defined inline in the screen** and only
  reachable through rendering. Frozen clock + non-UTC `TZ`. Cover: local-midnight
  rollover, a missed day breaking the streak, `longestStreak` updating only on
  exceed, a `startDate` in the **future** (produces zero nodes → no slider), an
  empty node list (`isStreakAlive` returns `true`), and a DST-transition day.
  Note `buildTimeline`'s own `dayNum++` counter is independent of
  `streak-schedule.ts`'s UTC-midnight `dayNumberOn` — assert they agree.
- **`workouts.tsx`** — `PAGE_SIZE = 15`, and `fetchWorkouts` calls `setPage(0)` on
  **every focus**. Deleting the last item on a page leaves an out-of-range page
  rendering an empty list. Delete failures are swallowed by a bare `catch {}`.
- **`settings-account`** — account deletion also purges the legacy
  `users/{uid}/workouts/{workoutId}` subcollection. That is the only remaining
  legacy-path touch in the app and is easy to drop in a refactor. Assert it. Also:
  the confirm-name comparison is against `username`, which can be `null`, and
  `deleteUser` runs **after** `purgeLocalAccountData`.
- **`settings-app`** — CSV export quotes only `name`/`notes`/`exName`/`variation`;
  reps, weights and durations are unquoted. `savingPreference` is a single value,
  so the second toggle is blocked while the first saves.
- **`analytics`** — Epley 1RM, PRs, best sets, volume distribution. Cover zero
  workouts, one workout, bodyweight sets (no weight), and duration-type exercises
  with no 1RM. Note `favoriteWorkoutType`'s tie-break reads `workoutTypeLastDate`,
  which is overwritten by iteration order rather than by max — history is
  date-DESC, so it lands on the **oldest** occurrence.
- **`social`** — `docs/purpose.md` says "not a social app: no feed, no followers,
  no comparison to other users." Assert the screen respects `useSocialEnabled()`
  and hides when off. `today` is computed **once per render**, so it goes stale
  across midnight while the screen stays mounted. `busyUid` is a single value —
  two buddies cannot be busy at once.
- **`planned-workouts`** — `flushQueueOrder` runs in the `useFocusEffect`
  **cleanup**, and early-returns on `length === 0`, so deleting the last plan then
  leaving never clears the `pumppal_queue_order_v1_{uid}` cache key.
- **`settings-injuries`** — `persist()` is a full diff-and-reconcile. Legacy or
  unknown body parts are filtered out of the UI by `isBodyPart` but are still in
  the DB, so the **next `persist` soft-deletes them**. That is data loss triggered
  by an unrelated edit; lock the current behavior and file it.
- **AI surfaces** — every one must hide behind `useAIEnabled()`. One test per AI
  surface asserting it renders nothing when `aiEnabled` is absent or `false`.
  Absent means off, for existing accounts too. Note `useSocialEnabled()` has the
  **opposite** default (absent = enabled) — test both so the asymmetry is pinned.
- **`modal.tsx`** — shares `useDraftExercises` with `active-workout` but with
  `trackCompletion: false`. Assert saved planned/logged docs carry **no**
  `completed` key. Its web date input reads UTC (`toISOString().split('T')[0]`) but
  writes local noon (`new Date(v + 'T12:00:00')`).
- **`(auth)/phone-auth.tsx`** — has **no `Stack.Screen` entry and zero inbound
  links**, but is still reachable by URL on web. Either test it as a reachable
  route or confirm with the user that it should be deleted; do not silently skip it.

## Phase 7 — Web/native parity (nothing covers this today)

Nineteen files have platform variants, including nine repository pairs where the
two implementations must behave identically:
`profile-repository`, `workout-repository`, `injury-repository`,
`catalog-repository`, `pushup-repository`, `account-data`, `client`,
`sync-trigger`, plus `lib/injuries` and `lib/firestore-rest-client`.

Write **one shared contract suite per repository interface** and run it against
both implementations in a loop, rather than two hand-written suites that drift:

```ts
for (const [name, repo] of [['native', nativeRepo], ['web', webRepo]]) {
  describe(`${name} workoutRepository`, () => { /* identical assertions */ });
}
```

Cover for each: `getById` on a missing id (`null`, not a throw), `getAll` on an
empty store (`[]`), create→read round-trip preserving every field, update
preserving unlisted fields, delete, and uid scoping (user A cannot read user B).
Native runs against `openTestDb()` (`src/data/test-executor.ts`, already exists);
web runs against a stubbed `fetch`.

`tools/check-web-native-deps.js` already proves no web entry point *imports* a
native package. It proves nothing about behavior. This phase is the behavioral half.

## Phase 8 — Tools and guardrails

The static checkers have real blind spots that a refactor will walk straight into.

- **`check-boundary-isolation.js`** only matches `from '...'`. `require()`, bare
  `import 'x'`, and dynamic `import('x')` are invisible. An MVC refactor that
  introduces dynamic imports would silently disable this check. Add tests using
  temp fixture dirs proving each forbidden form is caught — then widen the regex.
  It also scans neither `packages/contract/src` nor `tools/`.
- **`check-direct-boundaries.js`** asserts `worker.ts` does not match
  `/firestore|commit|runQuery|getDocument/` over the **whole file including
  comments**. It passes today only because the comments capitalise `Firestore`.
  Adding a lowercase `firestore` anywhere in a comment breaks the build. It is also
  not in `bun run test` — Phase 0 wires it in, so pin this behavior first.
- **`seed-exercise-catalog.js`** — `validateCatalog` returns an error array and
  never throws. Cover: `schemaVersion !== 2`, empty `exercises` (**early-returns**,
  skipping all per-exercise checks — a real gap), duplicate ids, empty
  `primaryMuscles`, a non-canonical muscle, duplicate variation ids within a
  parent. Then `buildExerciseDocument`'s `status ?? 'approved'` default, which is
  load-bearing: `firestore.rules` gates catalog reads on `status == 'approved'` and
  an equality filter never matches a missing field. Confirm the dry-run path
  **never reads the credential file and never opens a socket**.
- **`review-pending-exercises.js`** — `--apply` plus `--dry-run` together must
  throw; neither flag means read-only. `nextCatalogVersion` reads only
  `integerValue`, so a `doubleValue` reads as 0 and the version can go *backwards*.
- **`migrate-trust-domains.js`** — `stableJson`/`hash` determinism under key
  reordering; `planTrustDomainMigration` throws on an injury id containing `/`;
  `status === undefined` is strict so `null`/`''` are **not** planned;
  `copyMigrationPlan` never overwrites an existing destination.
- **`canonical-muscles.js`** already has a drift test against
  `src/constants/muscles.ts`. Leave it; just make sure it still runs after Phase 0.

## Verification

Run at each phase gate, not once at the end:

```bash
bun run typecheck          # tsc --noEmit across all three TS packages
bun run lint               # expo lint
bun run test               # the whole suite
bun run test:firestore-rules   # needs the emulator; firebase-tools is already a devDep
```

Phase gates:

| Phase | Gate |
|---|---|
| 0 | `bun run test` passes, discovered file count ≥ 61, `injuries.test.ts` now runs |
| 1 | the workflow goes green on a throwaway PR |
| 2 | `render(<ThemedText>hello</ThemedText>)` + `getByText('hello')` passes |
| 3 | every file listed has a matching `*.test.ts` |
| 4 | every route in `worker.ts` has ≥1 test; all 8 tombstones assert 410 |
| 5 | every file in `src/ui/` has a matching test |
| 6 | every route in `app/` has a matching test |
| 7 | each repository pair runs one shared suite |
| 8 | each `tools/` script has a test |

**Do not** run `bun run build:web`, `bunx expo export`, or any local native build —
repo rules forbid them as verification, and `bun test` is the wrong command to
reach for at the root (use `bun run test`).

The real end-to-end check on this work: `git stash` a behavioral change (flip a
comparison in `computeMuscleVolume`, drop the `.filter(s => s.completed)` in
`finishWorkout`) and confirm the suite goes red. A suite that stays green against
a deliberately broken build is not doing its job. Do this for at least three
distinct injected faults before calling the work done.

## Handoff notes for the implementer

- **Order matters.** Phases 0 → 1 → 2 are infrastructure; 3–8 can then be worked in
  any order, and 3 is the cheapest place to build momentum.
- **One PR per phase**, on a feature branch, opened as a **draft**
  (`gh pr create --draft`). Never commit to `main`, never merge.
- Before opening each PR, find or create the GitHub issue in the Timber project.
  Only ever create a **child** issue under an existing epic — never an epic. If it
  is unclear which epic applies, **stop and ask**.
- Track work with `bd`, not TodoWrite or markdown checklists.
- Reuse what exists: `openTestDb()` (`src/data/test-executor.ts`) for SQLite, the
  `createWorkerApp(verifyUid, verifyAppCheck)` injection seam for the API, the
  AsyncStorage stub pattern in `src/lib/ai-quota-cache.test.ts`, and the platform
  resolution order in `tools/check-web-native-deps.js:60-70`.
- **When stuck on whether something is a bug or intended: it is intended.** Lock
  current behavior, comment `// BUG:`, file a bead, move on.

## Appendix A — defects already found, to lock and file (do not fix)

Surfaced during exploration. Each needs a test asserting *current* behavior plus a
bead. Ranked by consequence.

1. **`isAIOp` prototype-chain hole** (`packages/contract/src/ai-contract.ts:93`) —
   `value in AI_OPS` walks the prototype chain, so `op: 'toString'` passes the
   guard, then `AI_OPS['toString'].input` is `undefined` and `.safeParse` throws a
   `TypeError` → **500 `Internal error` instead of 400 `Unknown operation`**.
2. **Malformed or absent JSON body → 500, not 400** on all six body-reading routes
   (`context.req.json()` throws a bare `SyntaxError` with no `.status`).
3. **`commit` tags only HTTP 409** (`apps/api/src/store/rest.ts:194`) while
   Firestore returns 400 for `FAILED_PRECONDITION` — if confirmed, every
   `updateTime` retry loop in the store is dead code.
4. **`chopCooldownRemainingMs` NaN bypass** (`store/buddies.ts:328`) — an
   unparseable `lastChop` yields `NaN`, `NaN > 0` is false, cooldown skipped.
5. **Case-only username rename is a silent no-op** (`store/profile.ts:82`) —
   `bob` → `Bob` never updates the display casing.
6. **`buddyChallenge`'s per-field `.catch()`** collapses the entire `days` array to
   `[]` on one malformed element instead of filtering it.
7. **`Number(durationSeconds) || 30`** (`ai/prompts.ts:126`) turns a legitimate `0`
   into 30.
8. **`slugifyUsername` re-introduces a trailing underscore** — `.slice(0,20)` runs
   after the trim.
9. **`isPublicCatalogEntry` accepts a doc with no `status`** (`store/catalog.ts:69`)
   while `firestore.rules` denies reading it — the two disagree.
10. **`slugify('###')` → `''` → doc id `pending-`**, a real reachable id.
11. **`runQuery` drops `limit: 0`** → unbounded query.
12. **`seed-exercise-catalog.js` PATCHes with no `updateMask`** → replaces whole
    documents, dropping `createdAt`/`createdBy`.
13. **Two Firestore codecs disagree on null** — `tools/` emits
    `{nullValue:'NULL_VALUE'}` (a string), `packages/contract` emits
    `{nullValue:null}`. A third codec lives in `firestore-readonly-snapshot.js`.
14. **`removeInjuryFromHistory` has no 404** while `apply-to-history` does.
15. **`localDate` accepts `'9999-99-99'`** and flows into streak math.
16. **The `OPTIONS ... : 403` branch in `worker.ts` is unreachable** — step 4 already
    returned 403 for a denied origin.

Mobile side:

17. **`settings-injuries.tsx` silently destroys data.** Injuries whose `bodyPart`
    fails `isBodyPart` are filtered out of the UI but still exist in the DB, so the
    next `persist()` — triggered by *any* unrelated injury edit — soft-deletes them.
18. **`_layout.tsx`'s `AsyncStorage.getItem(ONBOARDING_KEY).then(...)` has no
    `.catch`.** A read failure leaves `onboardingSeen === null` and the boot
    overlay up permanently.
19. **`purgeLocalAccountData` misses several AsyncStorage keys** — it matches
    `key.includes(uid)` plus three named shared keys, so
    `pumppal_daily_name_v1_*`, `pumppal_split_names_v2_*`, `pumppal_expo_push_token`,
    `pumppal_ai_quota_v1`, and `pumppal_onboarding_seen` survive a sign-out.
20. **`social.tsx`'s cooldown has the same `NaN` bypass as the server's** — a
    malformed `lastChoppedAt` re-enables the Chop button.
21. **`use-exercise-catalog`'s `loading` never clears when logged out** — it starts
    `true` and the effect early-returns on `!user`.
22. **`create-pending-exercise` ids collide** within the same millisecond
    (`pending-{slug}-{Date.now().toString(36)}`), and it writes
    `trackingModes: ['reps_weight']`, which is not a valid `TrackingMode` (cast
    through `unknown` — `src/types/workout.ts`'s `TrackingMode` is stale).
23. **`injuries.ts` (`src/data/`) `softDelete` reads via `getById`**, which filters
    `deleted = 0`, so soft-deleting an already-deleted injury silently no-ops and
    never queues the intent.
24. **`workouts.tsx` swallows delete failures** with a bare `catch {}`, and its
    empty state says "Tap + to log your first workout" — there is no + button on
    that screen.
25. **`nextSetIndex` is "last completed + 1", not "first incomplete"** — completing
    set 3 with 1 and 2 unticked jumps the cursor to 4. Probably intentional; pin it.
26. **`CLAUDE.md`'s "three holdouts" note is wrong** — there are five `.js` node
    tests in `apps/mobile`, and the `require.cache` reason applies to exactly one.
27. **`apps/mobile/src/data/injuries.test.ts` has never run.** Expect it to fail
    when Phase 0 wires it in.
28. **`app/(auth)/phone-auth.tsx` is orphaned** (no `Stack.Screen`, no inbound
    links) but reachable by URL on web. Needs a decision, not a silent skip.
29. **`app/development-progress.tsx` is not registered in the root `Stack`** and
    renders with a default header inconsistent with every other screen.

