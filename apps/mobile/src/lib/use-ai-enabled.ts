import { useAuth } from '@/context/auth-context';
import { useDataVersion } from '@/hooks/use-data-version';
import { isAIEnabled } from '@/lib/ai-enabled';
import { useEffect, useState } from 'react';

/**
 * Whether this account has opted in to AI. Screens use it to decide whether an
 * AI surface exists at all — hide the control, don't relabel it, because
 * "disabled" reads as a temporary state the user can wait out.
 *
 * Starts `false` and stays `false` while the profile read is in flight, so no
 * AI element flashes in before the opt-in is known. `useDataVersion` re-runs the
 * read after any local write, which is how flipping the toggle in Settings > App
 * reaches every mounted screen.
 */
export function useAIEnabled(): boolean {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isAIEnabled(user?.uid).then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, dataVersion]);

  return enabled;
}
