// Promoted out of app/(tabs)/pushup-challenge.tsx (where it was previously
// defined inline) so the local repository (src/data/pushup-repository.ts) has a
// shared type to store/retrieve without importing from a screen component.
// Shape unchanged — see docs/data-model/pushup-challenge.md.
export type ChallengeDay = {
  date: string; // YYYY-MM-DD
  dayNumber: number; // 1-indexed day within the current challenge run
  completedAt: string; // ISO timestamp
};

export type ChallengeData = {
  startDate: string; // YYYY-MM-DD, date the current run began
  days: ChallengeDay[]; // one entry per completed day, not one per calendar day
  longestStreak: number;
};
