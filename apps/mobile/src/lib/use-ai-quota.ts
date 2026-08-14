import { getAIQuota } from '@/data/remote/ai-quota';
import { useAuth } from '@/context/auth-context';
import { useCallback, useEffect, useState } from 'react';

/**
 * How many AI credits the signed-in user has left today.
 *
 * `null` means "not known yet" — the server has not answered. It is deliberately
 * not a number: the count is owned and enforced server-side
 * (`apps/api/src/store/quota.ts`), and any client-side `LIMIT - count` needs a
 * bundled copy of the limit that goes stale the moment the cap changes. A
 * shipped app would then show the wrong number and gate its own button early.
 *
 * Callers must treat `null` as "allow the attempt": the server answers 429 and
 * `AIQuotaError` is what actually turns the UI off.
 *
 * `setUsesLeft` exists so a caller can write back the `remaining` that
 * `/api/ai` returns with each successful response, rather than counting locally
 * and drifting away from the server.
 */

// Survives screen remounts inside one process, so navigating away and back
// after a call doesn't blank the count while a refetch is in flight.
// ponytail: in-memory only — a process restart refetches. Persist to
// AsyncStorage if a cold offline start needs to show a number.
const cache = new Map<string, number>();

export function useAIQuota() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [usesLeft, setState] = useState<number | null>(() => (uid ? cache.get(uid) ?? null : null));

  const setUsesLeft = useCallback(
    (value: number) => {
      if (uid) cache.set(uid, value);
      setState(value);
    },
    [uid]
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setState(cache.get(uid) ?? null);
    getAIQuota()
      .then(({ remaining }) => {
        if (cancelled) return;
        cache.set(uid, remaining);
        setState(remaining);
      })
      .catch(() => {
        // Offline, or the API is down. Leave whatever we already had: a cached
        // number from an earlier call is still the best answer, and a cold start
        // stays `null` rather than inventing one. The server enforces the cap
        // regardless, so nothing is lost by letting the user try.
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { usesLeft, setUsesLeft };
}
