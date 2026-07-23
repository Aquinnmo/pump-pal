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
  injuries?: Injury[]; // types/user.ts — full history; ongoing = status === 'ongoing'
  aiUsage?: { date: string; count: number }; // AI daily-limit counter, written by app/modal.tsx
};
```

The `UserDoc` / `Injury` types now live in `types/user.ts` (promoted from the
previously inferred inline shape when `injuries` was added).

## Injuries

`injuries` is a **flat array on the user doc**, not a subcollection: injuries
are few, so an array needs no extra reads and no new account-deletion line
(the user doc is already deleted — see below). Promote to a subcollection only
if a user ever accrues hundreds of injuries.

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

## The doc doesn't exist until onboarding completes

There is no "create user doc on sign-up" step. The doc is written for the
first time via `setDoc(doc(db, 'users', uid), { workoutSplit: {...} },
{ merge: true })` when the user finishes the forced first-run `set-split`
screen. Before that, `getDoc` on `users/{uid}` returns a non-existent
snapshot — `app/_layout.tsx`'s gating logic (`isSplitOption(splitType)` on a
`snapshot.data()?.workoutSplit?.type` read) already treats "no doc" and "doc
exists but no split" identically, both routing to the `set-split` screen. Any
new code reading this doc must handle the same non-existence case; don't
assume the doc is always there just because the user is authenticated.

`{ merge: true }` matters here too — settings.tsx re-saves `workoutSplit`
after onboarding (to let users change their split later) and merge ensures
that write doesn't clobber other top-level fields on the doc if any get added
later.

## Account deletion

`app/(tabs)/settings.tsx`'s delete-account flow deletes, in order: all
`workouts` docs where `userId == uid`, the legacy `users/{uid}/workouts/*`
subcollection (see [legacy.md](./legacy.md)), `users/{uid}/pushup-challenge/data`
(see [pushup-challenge.md](./pushup-challenge.md)), then `users/{uid}`
itself, then the Firebase Auth user. This is the one place that touches every
per-user collection — if a new per-user collection is added, it needs a line
added here too, or account deletion will silently leave orphaned data.
