# Pump Pal Data Model

Source of truth for every Firestore collection/document the app reads or
writes. Firebase project: `pumppal-c9199`. When code and this doc disagree,
treat this doc as correct and fix the code (or fix the doc in the same PR that
changes the shape).

For the historical record of the legacy-to-canonical migration (what changed,
when, and why), see [`firestore-data-refactor.md`](../firestore-data-refactor.md).
This directory describes the schema as it exists today.

**Access path (grace period, in progress):** a Vercel API boundary
(`api/**`, routes documented in [api-operations.md](../api-operations.md))
now covers every collection below with an authenticated REST route, wire-typed
via [`shared/api-contract.ts`](../../shared/api-contract.ts). It runs
*additively* alongside direct client Firestore access under the current
`firestore.rules` — both paths write the same shapes described here, so
neither is more authoritative than the other during the grace period. Direct
client Firestore access is cut off only at the explicit, human-approved
deny-all rules deployment described in
[deployment.md § Stage 4](../deployment.md#stage-4--the-deny-all-cutover-human-gated-do-last);
until then, treat this doc as describing the shapes, not the only way they get
written.

**Indexes:** composite indexes live in
[`firestore.indexes.json`](../../firestore.indexes.json) (deployed with
`npx firebase-tools@latest deploy --only firestore:indexes`). Any new
`runQuery` in `api/_lib/store/` that combines a `where` with an `orderBy` on a
different field needs an entry there first — without one Firestore answers
`400 FAILED_PRECONDITION` and the route 500s.

## Collections

| Path | Purpose | Doc |
| --- | --- | --- |
| `exercises/{exerciseId}` | Global exercise catalog (with embedded variations) | [exercises.md](./exercises.md) |
| `exerciseCatalogMeta/current` | Cache-invalidation version marker for the catalog | [exercises.md](./exercises.md#exercisecatalogmetacurrent) |
| `workouts/{workoutId}` | Canonical set-by-set workout history | [workouts.md](./workouts.md) |
| `users/{uid}` | Per-user profile (workout split, username) | [users.md](./users.md) |
| `usernames/{usernameLower}` | Username uniqueness reservation, server-only | [users.md](./users.md#usernames) |
| `users/{uid}/pushup-challenge/data` | Pushup Challenge (TPC tab) progress | [pushup-challenge.md](./pushup-challenge.md) |
| `friendships/{pairId}` | Timber Buddies social graph + chop cooldowns, server-only | [buddies.md](./buddies.md) |
| `users/{uid}/workouts/{oldWorkoutId}` | **Legacy**, pre-migration workout rows | [legacy.md](./legacy.md) |

## Native offline-first behavior

iOS and Android treat UID-scoped Expo SQLite rows as the UI source of truth.
Every user mutation changes the local entity and its coalesced outbox record
in one transaction; native screens therefore read committed local state even
without a network. The outbox synchronizes through the API when connectivity
returns, using opaque server versions as `baseVersion` values. A `409` or a
dirty record deleted remotely creates a persisted conflict that retains both
copies until the user chooses **Keep This Device** or **Use Server Copy**.
Workouts and injuries retain independent SQLite rows; profile and push-up
challenge are UID-singleton rows. Pending exercise submissions are also
durable local rows, but are uploaded through the catalog endpoint rather than
the manifest because the approved catalog is a shared cache, not user data.

Firebase Auth remains client-side. Web deliberately has no SQLite cache and
uses the API-backed repository implementations directly. Before sign-out or
account deletion, the app must sync pending data or obtain an explicit
discard choice, then erase the UID's SQLite rows and account-derived caches.
The detailed human rollout and recovery gate is in
[deployment.md](../deployment.md#stage-4--the-deny-all-cutover-human-gated-do-last);
the deny-all rules file is prepared but must not be deployed without that
separate approval.

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
