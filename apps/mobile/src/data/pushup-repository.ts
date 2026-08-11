import { getDb } from './client';
import { createSingletonRepository } from './singleton-repository';
import { ChallengeData } from '@/types/pushup-challenge';

// users/{uid}/pushup-challenge/data — see docs/data-model/pushup-challenge.md.
// A reset/new run is a full replace in Firestore today (no merge); callers
// keep that semantic by always passing the complete ChallengeData to
// upsert(), same as the current setDoc(..., { merge: false }) call site.
export const pushupRepository = createSingletonRepository<ChallengeData>(
  getDb,
  'pushup_challenge',
  'pushup_challenge'
);
