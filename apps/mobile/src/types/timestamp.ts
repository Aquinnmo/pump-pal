import { Timestamp } from 'firebase/firestore';

/**
 * Every shape a "when did this happen" field has carried across the app's
 * history: a real Firestore `Timestamp` (legacy direct-Firestore writes,
 * being phased out per the offline-first migration), a plain
 * `{ seconds, nanoseconds }` object (migrated data), a `Date` (in-memory
 * drafts), or an ISO-8601 string (local SQLite storage — see
 * src/data/normalize-timestamps.ts — and the API wire format — see
 * packages/contract/src/api-contract.ts's `isoTimestamp`). Always read through
 * `src/lib/workout-conversion.ts`'s `toDateObj()` rather than assuming one
 * shape, same rule that already applied to `Workout.date`.
 */
export type FlexibleTimestamp = Timestamp | { seconds: number; nanoseconds: number } | Date | string;
