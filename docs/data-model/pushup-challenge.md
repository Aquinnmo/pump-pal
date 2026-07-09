# Pushup Challenge (TPC tab)

Path: `users/{uid}/pushup-challenge/data` (single fixed doc, not a growing
subcollection — `data` is a literal doc ID). No shared type in
`types/workout.ts`; `ChallengeDay`/`ChallengeData` are defined locally in
`app/(tabs)/pushup-challenge.tsx`.

This feature is unrelated to the workout/exercise schema — it's a
self-contained daily-streak tracker for a separate "TPC" pushup challenge
tab. It predates, and was intentionally left out of, the workout-schema
migration described in [`firestore-data-refactor.md`](../firestore-data-refactor.md).

## Shape

```ts
type ChallengeDay = {
  date: string;        // YYYY-MM-DD
  dayNumber: number;   // 1-indexed day within the current challenge run
  completedAt: string; // ISO timestamp
};

type ChallengeData = {
  startDate: string;   // YYYY-MM-DD, date the current run began
  days: ChallengeDay[]; // one entry per completed day, not one per calendar day
  longestStreak: number;
};
```

Notes:

- `days` only contains completed days — a gap in the date sequence is a
  missed day, not represented by an absent-but-expected entry. The UI
  (`buildTimeline()`) reconstructs the full calendar range from `startDate`
  to today and cross-references it against `days` to render misses.
- Starting a new challenge run (or restarting after reset) overwrites the
  whole doc with `{ startDate: today, days: [], longestStreak: prev }` —
  `longestStreak` is the one field that survives a reset, everything else is
  a full replace via `setDoc` (no `merge: true`), not a partial update.
- Read via a plain `getDoc`; if the doc doesn't exist, the screen treats it
  as "no active challenge" (`data === null`), same non-existence handling
  pattern as `users/{uid}` in [users.md](./users.md).
- Deleted as part of account deletion (`app/(tabs)/settings.tsx`) — see
  [users.md](./users.md#account-deletion).
