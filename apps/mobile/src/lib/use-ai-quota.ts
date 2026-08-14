import { getAIQuota } from '@/data/remote/ai-quota';
import { getCachedRemaining, hydrateAIQuota, recordRemaining, subscribeAIQuota } from '@/lib/ai-quota-cache';
import { useAuth } from '@/context/auth-context';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * How many AI credits the signed-in user has left today.
 *
 * `null` means "not known yet" — nothing cached and the server has not answered.
 * It is deliberately not a number: the count is owned and enforced server-side
 * (`apps/api/src/store/quota.ts`), and any client-side `LIMIT - count` needs a
 * bundled copy of the limit that goes stale the moment the cap changes. A
 * shipped app would then show the wrong number and gate its own button early.
 *
 * Callers must treat `null` as "allow the attempt": the server answers 429 and
 * `AIQuotaError` is what actually turns the UI off.
 *
 * There is no setter. `callAI` records `remaining` from every AI response into
 * `ai-quota-cache`, and this subscribes — so a call made on one screen updates
 * the count on every other, and a call site that ignores the number still
 * refreshes it. Reading through useSyncExternalStore also means this hook never
 * schedules a state update of its own, mounted or not.
 */
export function useAIQuota() {
  const { user } = useAuth();
  const uid = user?.uid;

  const usesLeft = useSyncExternalStore(
    subscribeAIQuota,
    useCallback(() => getCachedRemaining(uid), [uid])
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      // Awaited, not raced: the disk read settles before the network call, so a
      // slow read can never land on top of the fresher server answer.
      await hydrateAIQuota(uid);
      if (cancelled) return;
      try {
        const { remaining } = await getAIQuota();
        if (!cancelled) recordRemaining(uid, remaining);
      } catch {
        // Offline, or the API is down. Keep whatever was cached — a number from
        // an earlier call is still the best answer, and a cold start stays
        // `null` rather than inventing one. The server enforces the cap
        // regardless, so nothing is lost by letting the user try.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { usesLeft };
}
