# Pump Pal Data Model

Source of truth for every Firestore collection/document the app reads or
writes. Firebase project: `pumppal-c9199`. When code and this doc disagree,
treat this doc as correct and fix the code (or fix the doc in the same PR that
changes the shape).

This directory describes the schema as it exists today. The legacy-to-canonical
migration is complete; the shape it left behind is described in
[legacy.md](./legacy.md), and its blow-by-blow historical record has been
retired (recoverable from git history as `docs/firestore-data-refactor.md`).

**Access path:** safe owner operations use direct Firestore REST from the
client, guarded by Firebase Auth, App Check, and `firestore.rules`. The
Cloudflare Worker handles only privileged token-bearing operations (AI,
usernames/push tokens, buddies, pending catalog submissions, injury-history
bulk operations, and account deletion). It has no generic Firestore proxy;
retired safe API paths return an upgrade tombstone during cutover. See
[api-operations.md](../api-operations.md) and the human-gated
[deployment checklist](../deployment.md).

**Indexes:** composite indexes live in
[`firestore.indexes.json`](../../firestore.indexes.json) (deployed with
`npx firebase-tools@latest deploy --only firestore:indexes`). Any new direct
client query that combines a `where` with an `orderBy` on a different field
needs an entry there first — without one Firestore answers
`400 FAILED_PRECONDITION`.

## Collections

| Path | Purpose | Doc |
| --- | --- | --- |
| `exercises/{exerciseId}` | Global exercise catalog (with embedded variations) | [exercises.md](./exercises.md) |
| `exerciseCatalogMeta/current` | Cache-invalidation version marker for the catalog | [exercises.md](./exercises.md#exercisecatalogmetacurrent) |
| `workouts/{workoutId}` | Canonical set-by-set workout history | [workouts.md](./workouts.md) |
| `users/{uid}` | Per-user profile (workout split, username) | [users.md](./users.md) |
| `users/{uid}/injuries/{injuryId}` | Per-item injury history, owner-scoped | [users.md](./users.md#injuries) |
| `users/{uid}/private/aiUsage` | Server-managed AI quota | [users.md](./users.md#private-documents) |
| `users/{uid}/private/notifications` | Expo push-token storage | [users.md](./users.md#private-documents) |
| `usernames/{usernameLower}` | Username uniqueness reservation, server-only | [users.md](./users.md#usernames) |
| `users/{uid}/pushup-challenge/data` | Pushup Challenge (TPC tab) progress | [pushup-challenge.md](./pushup-challenge.md) |
| `friendships/{pairId}` | Timber Buddies social graph + chop cooldowns, server-only | [buddies.md](./buddies.md) |
| `users/{uid}/workouts/{oldWorkoutId}` | **Legacy**, pre-migration workout rows | [legacy.md](./legacy.md) |

## Native offline-first behavior

iOS and Android treat UID-scoped Expo SQLite rows as the UI source of truth.
Every user mutation changes the local entity and its coalesced outbox record
in one transaction; native screens therefore read committed local state even
without a network. The outbox synchronizes directly to Firestore REST when
connectivity returns, using opaque `updateTime` versions. It retries auth once,
backs off transient failures, retries one conflict with the local change, and
parks permanent failures for the UI to surface.
Workouts and injuries retain independent SQLite rows; profile and push-up
challenge are UID-singleton rows. Pending exercise submissions are also
durable local rows, but are uploaded through the privileged Worker because
the approved catalog is a shared cache, not user data.

Firebase Auth remains client-side. Web deliberately has no SQLite cache and
uses direct Firestore repository implementations. Before sign-out or
account deletion, the app must sync pending data or obtain an explicit
discard choice, then erase the UID's SQLite rows and account-derived caches.
The detailed human rollout and recovery gate is in
[deployment.md](../deployment.md); remote Rules/App Check changes require
separate human approval.

### Finalized user writes

User-authored drafts are memory-only on every platform. The one exception is
the active workout draft, which is also snapshotted to `AsyncStorage` so a
process death doesn't lose it (`apps/mobile/src/lib/active-workout-session.ts`)
— that snapshot is still a private draft, not a database row, and never enters
the outbox. Native workout and injury changes are finalized by an explicit
action, then commit the local row and coalesced outbox intent in one SQLite
transaction; synchronization is requested only after that transaction
succeeds. The active workout is finalized once on Finish, while push-up
Start/Complete/Undo/Reset are immediate finalized actions. Web has no local
cache and writes finalized changes directly, retaining the Firestore
`updateTime` version for optimistic concurrency.

Username uniqueness is a Worker-only exception: the Worker must confirm the
reservation first, after which native stores a synced local profile snapshot
without an outbox intent. Push-token registration, Firebase Auth, reads, sync,
and server bookkeeping are system operations rather than user drafts.

## Conventions used throughout

- **Types live in code.** Every shape below has a matching TypeScript type,
  named in each doc, usually in `apps/mobile/src/types/workout.ts`. Read the type for the
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
  normalized for display (see `apps/mobile/src/lib/workout-conversion.ts`).
- **IDs are deterministic where possible.** Exercise doc IDs are slugs
  (`bench-press`), not auto-generated — this is what makes catalog reseeding
  idempotent (see [exercises.md](./exercises.md)). Migrated workout doc IDs
  are derived from the legacy path for the same reason (see
  [legacy.md](./legacy.md)).
