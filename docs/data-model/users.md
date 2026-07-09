# Users

Path: `users/{uid}` · No dedicated TypeScript type — the doc has exactly one
field group today, read inline with `snapshot.data()?.workoutSplit`.

`{uid}` is the Firebase Auth uid. Auth itself (email, phone, password) lives
in Firebase Auth, not in this doc — this doc is Firestore-side app state
about the user, and today that's just their workout split.

## Shape

```ts
type UserDoc = {
  workoutSplit?: {
    type: SplitOption; // constants/split-options.ts — 'Push / Pull / Legs' | 'Upper / Lower' | 'Bro Split' | 'Full Body' | 'Other'
    custom: string | null; // free text when type === 'Other', else null
    updatedAt: Timestamp;
  };
};
```

There is no explicit `UserDoc` type in code — this shape is inferred from the
two write sites (`app/set-split.tsx`, `app/(tabs)/settings.tsx`) and one read
site (`app/_layout.tsx`), all of which agree on this shape. If you add a
second field to this doc, consider promoting it to a real type in
`types/workout.ts` (or a new `types/user.ts`) at that point.

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
