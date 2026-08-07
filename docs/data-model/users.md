# Users

Path: `users/{uid}` · Typed as `UserDoc` in `types/user.ts`.

`{uid}` is the Firebase Auth uid. Auth itself (email, phone, password) lives
in Firebase Auth, not in this doc — this doc is Firestore-side app state
about the user: their workout split and their injury history.

## Shape

```ts
type UserDoc = {
  workoutSplit?: {
    type: SplitOption; // constants/split-options.ts — 'Push / Pull / Legs' | 'Upper / Lower' | 'Bro Split' | 'Full Body' | 'Other'
    custom: string | null; // free text when type === 'Other', else null
    updatedAt: Timestamp;
  };
  username?: string; // canonical display casing — see "Usernames" below
  usernameLower?: string; // lowercase, matches the usernames/{id} reservation doc key
  injuries?: Injury[]; // types/user.ts — full history; ongoing = status === 'ongoing'
  aiUsage?: { date: string; count: number }; // AI daily-limit counter, shared by plan and active-workout suggestions
  expoPushToken?: string; // Expo push token for this device — see "Push token" below
};
```

The `UserDoc` / `Injury` types now live in `types/user.ts` (promoted from the
previously inferred inline shape when `injuries` was added).

## Push token

`expoPushToken` is what makes a user reachable by a Chop
([buddies.md](./buddies.md)). Registered by `hooks/use-push-token.native.ts`
from the authenticated tab shell — not from the Social screen, since a chop has
to reach people who never open that tab — and written through
`PATCH /api/profile` like any other allowlisted profile field. The hook caches
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
`api/_lib/store/profile.ts`'s `updateProfile` — never touched by client
Firestore rules or the outbox/sync layer directly. A rename deletes the old
`usernames/{oldLower}` doc and creates the new one in the same commit as the
`users/{uid}` update, so the three writes succeed or fail together.

Sign-up (manual and Google OAuth) and Settings → Account → Username all reach
this through `PATCH /api/profile` (`repositories/remote/profile.ts`'s
`patchProfile`), called directly rather than through the offline-first
`profileRepository.upsert()` path — a unique username has to be confirmed by
the server before the UI can call it saved, unlike `workoutSplit`, which
tolerates eventual consistency fine.

## Injuries

`injuries` is a **flat array on the user doc**, not a subcollection: injuries
are few, so an array needs no extra reads and no new account-deletion line
(the user doc is already deleted — see below). Promote to a subcollection only
if a user ever accrues hundreds of injuries.

On native clients the SQLite cache deliberately mirrors each injury as its own
UID-scoped row so the API sync manifest can reconcile stable injury ids and
offline edits independently. This is a client-cache representation only; the
authoritative Firestore document remains the flat array above.

Each `Injury` has a client-generated `id`, a `bodyPart` (`constants/body-parts.ts`,
mapped to canonical muscles via `BODY_PART_MUSCLES` so it joins the
muscle-volume engine in `utils/muscle-analysis.ts`), `severity`, `status`
(`ongoing` | `resolved`), onset/resolved timestamps, and optional
`side`/`muscles`/`avoid`/`notes`. Injury timestamps use `Timestamp.now()`, not
`serverTimestamp()` — Firestore forbids sentinel values inside array elements.

`onsetDate` and `resolvedDate` define an injury's **window** — the span
`[onsetDate, resolvedDate ?? now]` that its retroactive history apply targets.

Write/read sites (`utils/injuries.ts` + `app/settings-injuries.tsx`):
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

Sign-up (`PATCH /api/profile` with `{ username }`, from `app/(auth)/sign-up.tsx`
or the forced `app/set-username.tsx` screen for Google OAuth) now creates this
doc immediately, ahead of `set-split`. `app/_layout.tsx`'s gating logic
(`db/initial-sync.ts`'s `decideAccountBootstrap`) checks username before split
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

`api/_lib/store/account.ts`'s `deleteAccountData` (invoked from
`app/settings-account.tsx`'s delete-account flow) deletes, in order: the
`usernames/{usernameLower}` reservation (read off `users/{uid}` before it's
gone — must run first), all `workouts` docs where `userId == uid`, the legacy
`users/{uid}/workouts/*` subcollection (see [legacy.md](./legacy.md)),
`users/{uid}/pushup-challenge/data` (see
[pushup-challenge.md](./pushup-challenge.md)), then `users/{uid}` itself, then
the Firebase Auth user. This is the one place that touches every per-user
collection — if a new per-user collection is added, it needs a line added
here too, or account deletion will silently leave orphaned data.
