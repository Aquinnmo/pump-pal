import { Timestamp } from 'firebase/firestore';
import { BodyPart } from '@/constants/body-parts';
import { MuscleId } from '@/constants/muscles';
import { SplitOption } from '@/constants/split-options';

export type InjurySeverity = 'mild' | 'moderate' | 'severe';
export type InjurySide = 'left' | 'right' | 'both';

// 'ongoing' = active, input via the About screen today. 'resolved' supports the
// future past-injury UI; only its status/resolvedDate change on resolution.
export type InjuryStatus = 'ongoing' | 'resolved';

// Firestore may hand back a Timestamp or a plain {seconds,nanoseconds} depending
// on read path — same tolerance used by Workout.date in types/workout.ts.
type StoredTimestamp = Timestamp | { seconds: number; nanoseconds: number };

export type Injury = {
  id: string; // client-generated stable id
  bodyPart: BodyPart;
  side?: InjurySide;
  muscles?: MuscleId[]; // optional precise muscles beyond the bodyPart map
  severity: InjurySeverity;
  status: InjuryStatus;
  onsetDate: StoredTimestamp;
  resolvedDate?: StoredTimestamp | null;
  avoid?: string[]; // movements/exercises to avoid — input to future AI
  notes?: string;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
};

/**
 * The `users/{uid}` document. Previously untyped (read inline as
 * `snapshot.data()?.workoutSplit`); promoted to a real type now that a second
 * field group (`injuries`) exists — see docs/data-model/users.md.
 *
 * `injuries` is a flat array on the doc, not a subcollection: injuries are few,
 * so an array needs no extra reads and no new account-deletion line (the user
 * doc is already deleted). Promote to a subcollection only if a user ever
 * accrues hundreds of injuries.
 */
export type UserDoc = {
  workoutSplit?: {
    type: SplitOption;
    custom: string | null;
    updatedAt: StoredTimestamp;
  };
  injuries?: Injury[]; // full history; ongoing = status === 'ongoing'
  aiUsage?: { date: string; count: number };
};
