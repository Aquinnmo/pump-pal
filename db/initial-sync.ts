import { isSplitOption } from '@/constants/split-options';
import type { SyncOutcome } from './sync-engine';
import type { UserDoc } from '@/types/user';

/**
 * The sign-in sync result, kept separate from the ordinary background-sync
 * status so onboarding can distinguish an authoritative empty profile from a
 * failed attempt to read one.
 */
export type InitialSyncOutcome =
  | { kind: 'success'; uid: string }
  | { kind: 'offline'; uid: string; message: string }
  | { kind: 'auth-failure'; uid: string; message: string }
  | { kind: 'retryable-failure'; uid: string; message: string }
  | { kind: 'auth-transition'; uid: string };

export type AccountBootstrapDecision =
  | { state: 'ready'; source: 'cached' | 'remote' }
  | { state: 'onboarding' }
  | { state: 'error'; message: string }
  | { state: 'pending' };

function isOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|ENOTFOUND|ECONNREFUSED|timed out/i.test(message);
}

function safeErrorMessage(error: unknown): string {
  if (isOfflineError(error)) return 'Network error. Check your connection and try again.';
  return 'Could not load your account. Try again.';
}

/** Turns the sync engine's full result into the smaller sign-in contract. */
export function initialSyncOutcomeFromSync(uid: string, outcome: SyncOutcome): InitialSyncOutcome {
  switch (outcome.status) {
    case 'ok':
      return { kind: 'success', uid };
    case 'auth-required':
      return { kind: 'auth-failure', uid, message: 'We could not verify this session. Try again.' };
    case 'rate-limited':
      return { kind: 'retryable-failure', uid, message: 'Could not load your account. Try again.' };
    case 'partial':
      return { kind: 'retryable-failure', uid, message: 'Could not load your account. Try again.' };
  }
}

export function initialSyncOutcomeFromError(uid: string, error: unknown): InitialSyncOutcome {
  return isOfflineError(error)
    ? { kind: 'offline', uid, message: safeErrorMessage(error) }
    : { kind: 'retryable-failure', uid, message: safeErrorMessage(error) };
}

function hasSplit(profile: UserDoc | null): boolean {
  return isSplitOption(profile?.workoutSplit?.type);
}

/**
 * A cached split is enough to open the app offline. Only a successful,
 * authoritative bootstrap that still has no split can enter onboarding.
 */
export function decideAccountBootstrap(
  cachedProfile: UserDoc | null,
  hydratedProfile: UserDoc | null,
  outcome: InitialSyncOutcome
): AccountBootstrapDecision {
  if (hasSplit(cachedProfile)) return { state: 'ready', source: 'cached' };

  if (outcome.kind === 'auth-transition') return { state: 'pending' };
  if (outcome.kind === 'success') {
    return hasSplit(hydratedProfile) ? { state: 'ready', source: 'remote' } : { state: 'onboarding' };
  }

  return { state: 'error', message: outcome.message };
}
