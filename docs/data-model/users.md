# Users

Path: `users/{uid}` · Typed as `UserDoc` in `apps/mobile/src/types/user.ts`.

`{uid}` is the Firebase Auth uid. Auth itself (email, phone, password) lives
in Firebase Auth, not in this doc — this doc is Firestore-side app state
about the user: their workout split and their injury history.

## Shape

```ts
type UserDoc = {
  workoutSplit?: {
    type: SplitOption; // apps/mobile/src/constants/split-options.ts — 'Push / Pull / Legs' | 'Upper / Lower' | 'Bro Split' | 'Full Body' | 'Other'
    custom: string | null; // free text when type === 'Other', else null
    updatedAt: Timestamp;
  };
  username?: string; // canonical display casing — see "Usernames" below
  usernameLower?: string; // lowercase, matches the usernames/{id} reservation doc key
};
```

The `UserDoc` / `Injury` types now live in `apps/mobile/src/types/user.ts` (promoted from the
previously inferred inline shape when `injuries` was added).

## Push token

`expoPushToken` is what makes a user reachable by a Chop
([buddies.md](./buddies.md)). Registered by `apps/mobile/src/hooks/use-push-token.native.ts`
from the authenticated tab shell — not from the Social screen, since a chop has
to reach people who never open that tab — and written to
`users/{uid}/private/notifications` by the privileged API. The hook caches
the last-sent value in AsyncStorage so an unchanged token doesn't spend a write
every cold start.

One token per account, so the most recent device wins. Web has no Expo push
token and never writes this field; those users record chops normally but
receive nothing.

## Usernames

Path: `usernames/{usernameLower}` — `{ uid: string; username: string; createdAt: Timestamp }`.

A separate top-level collection reserves usernames for uniqueness: the doc ID
*is* the lock (lowercased), so a same-batch Firestore `:commit` with
`currentDocument: { exists: false }` on this doc is what actually prevents a
race, not any pre-check read. Written and read exclusively server-side, from
`apps/api/src/store/profile.ts`'s `updateProfile` — never touched by client
Firestore rules or the outbox/sync layer directly. A rename deletes the old
`usernames/{oldLower}` doc and creates the new one in the same commit as the
`users/{uid}` update, so the three writes succeed or fail together.

Sign-up (manual and Google OAuth) and Settings → Account → Username all reach
this through `PATCH /api/profile` (`apps/mobile/src/data/remote/profile.ts`'s
`patchProfile`). A unique username has to be confirmed by the server before
the UI can call it saved. After that response, native updates its local profile
snapshot as already-synced state with the returned version and creates no
profile outbox intent; web remains Worker-authoritative. This differs from
`workoutSplit`, which tolerates eventual consistency and uses the normal
offline-first repository path.

## Private documents

Server-managed and device-specific fields live outside the client-editable
profile document:

- `users/{uid}/private/aiUsage` is `{ date, count }`, the AI daily-limit
  counter. Clients never write it.
- `users/{uid}/private/notifications` holds `{ expoPushToken, updatedAt }`.
  It is used only by the privileged notification path.

## Injuries

Each injury is an independent document at
`users/{uid}/injuries/{injuryId}`. The client-generated injury id is the
document ID, so each record has its own opaque Firestore `updateTime` version.
The old `users/{uid}.injuries` array is compatibility data only and is retained
for 14 days after verified migration before explicit cleanup.

On native clients the SQLite cache deliberately mirrors each injury as its own
UID-scoped row so bounded direct Firestore reconciliation can preserve stable
injury ids and offline edits independently. This is a client-cache
representation only; the authoritative Firestore document is the per-item
subcollection above.

Each `Injury` has a client-generated `id`, a `bodyPart` (`apps/mobile/src/constants/body-parts.ts`,
mapped to canonical muscles via `BODY_PART_MUSCLES` so it joins the
muscle-volume engine in `apps/mobile/src/lib/muscle-analysis.ts`), `severity`, `status`
(`ongoing` | `resolved`), onset/resolved timestamps, and optional
`side`/`muscles`/`avoid`/`notes`. Injury timestamps use `Timestamp.now()`, not
`serverTimestamp()` — Firestore forbids sentinel values inside array elements.

`onsetDate` and `resolvedDate` define an injury's **window** — the span
`[onsetDate, resolvedDate ?? now]` that its retroactive history apply targets.

Write/read sites (`apps/mobile/src/lib/injuries.ts` + `apps/mobile/app/settings-injuries.tsx`):
- `getOngoingInjuryIds` — read at workout-completion to stamp `workouts/{id}.injuries`.
- `applyInjuryToHistory(uid, injury)` — from the injuries screen, `arrayUnion`s
  the injury id onto every completed workout whose `date` falls in the injury's
  window. Idempotent (re-applying never duplicates).
- `removeInjuryFromHistory(uid, injuryId)` — `arrayRemove`s the id from every
  workout, and the screen then deletes the injury record from this doc. Full
  removal touches both the workouts and the user level.

The injuries screen manages both **ongoing** and **past** (resolved) injuries:
add (with a past onset, optionally already-resolved), edit onset/resolved dates
inline, resolve, apply-to-history, or remove.

## The doc is created at sign-up, to hold the username

Sign-up (`PATCH /api/profile` with `{ username }`, from `apps/mobile/app/(auth)/sign-up.tsx`
or the forced `apps/mobile/app/set-username.tsx` screen for Google OAuth) now creates this
doc immediately, ahead of `set-split`. `apps/mobile/app/_layout.tsx`'s gating logic
(`apps/mobile/src/data/initial-sync.ts`'s `decideAccountBootstrap`) checks username before split
— `{ state: 'onboarding', step: 'username' | 'split' }` — routing to
`/set-username` first, then `/set-split`, when either is missing. Code reading
this doc must still handle non-existence (a user can be authenticated with
neither step complete yet, e.g. mid-onboarding or on a fresh read before the
first PATCH lands); don't assume the doc is always there.

`{ merge: true }` matters here too — settings.tsx re-saves `workoutSplit`
after onboarding (to let users change their split later) and merge ensures
that write doesn't clobber other top-level fields on the doc if any get added
later.

## Account deletion

`apps/api/src/store/account.ts`'s `deleteAccountData` (invoked from
`apps/mobile/app/settings-account.tsx`'s delete-account flow) deletes, in order: the
`usernames/{usernameLower}` reservation (read off `users/{uid}` before it's
gone — must run first), all `workouts` docs where `userId == uid`, the legacy
`users/{uid}/workouts/*` subcollection (see [legacy.md](./legacy.md)),
`users/{uid}/injuries/*`, `users/{uid}/private/*`,
`users/{uid}/pushup-challenge/data` (see
[pushup-challenge.md](./pushup-challenge.md)), then `users/{uid}` itself, then
the Firebase Auth user. This is the one place that touches every per-user
collection — if a new per-user collection is added, it needs a line added
here too, or account deletion will silently leave orphaned data.

## Trust-domain migration and cleanup

`tools/migrate-trust-domains.js --snapshot <export.json>` is dry-run only: it
creates a deterministic copy plan and count/hash verification report without
contacting Firebase. An authorized operator performs copy, verification, and
cleanup as three separate actions. Existing destination documents are never
overwritten. After verification succeeds, retain legacy `injuries`, `aiUsage`,
and `expoPushToken` fields for 14 days; cleanup is a separate human-authorized
operation.
