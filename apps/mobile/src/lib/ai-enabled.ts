import { profileRepository } from '@/data/profile-repository';

/**
 * The account's AI opt-in (`users/{uid}.aiEnabled`).
 *
 * AI is off unless the user turned it on, so *every* unknown resolves to
 * `false`: no profile row yet, a read that threw, a field that was never
 * written. This is deliberately the opposite of `useAIQuota`'s `null`, which
 * means "not known, let the attempt through" — a credit balance the client
 * guesses wrong costs a round trip, but AI guessed wrong ships a user's workout
 * history to a third party they declined.
 *
 * The server enforces the same flag (`apps/api/src/store/quota.ts`
 * `readAIEnabled`); this exists so the UI can hide rather than fail.
 */
export async function isAIEnabled(uid: string | undefined): Promise<boolean> {
  if (!uid) return false;
  try {
    return (await profileRepository.get(uid))?.data.aiEnabled === true;
  } catch {
    return false;
  }
}
