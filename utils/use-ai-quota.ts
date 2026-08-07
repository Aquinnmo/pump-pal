import { profileRepository } from '@/db/profile-repository';
import { useAuth } from '@/context/auth-context';
import { TEMPORARY_AI_DAILY_LIMIT } from '@/shared/ai-contract';
import { useEffect, useState } from 'react';

/**
 * How many AI uses the signed-in user has left today.
 *
 * The count is owned and enforced server-side (`api/_lib/store/quota.ts`); this
 * only reflects it. A record from a previous UTC day reads as a full quota,
 * matching the server's own rollover in `nextUsage` — there is no reset job.
 *
 * `setUsesLeft` exists so a caller can write back the `remaining` that
 * `/api/ai` returns with each successful response, rather than counting locally
 * and drifting away from the server.
 */
export function useAIQuota() {
  const { user } = useAuth();
  const [usesLeft, setUsesLeft] = useState(TEMPORARY_AI_DAILY_LIMIT);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    profileRepository
      .get(user.uid)
      .then((profile) => {
        if (cancelled) return;
        const aiUsage = profile?.data?.aiUsage;
        const todayUTC = new Date().toISOString().slice(0, 10);
        setUsesLeft(
          aiUsage && aiUsage.date === todayUTC
            ? TEMPORARY_AI_DAILY_LIMIT - (aiUsage.count ?? 0)
            : TEMPORARY_AI_DAILY_LIMIT
        );
      })
      .catch(() => {
        // An unreadable profile must not lock the feature out — the server is
        // the one that actually enforces the limit, and it answers 429.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { usesLeft, setUsesLeft };
}
