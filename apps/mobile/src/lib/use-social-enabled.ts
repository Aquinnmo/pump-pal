import { useAuth } from '@/context/auth-context';
import { profileRepository } from '@/data/profile-repository';
import { useDataVersion } from '@/hooks/use-data-version';
import { useEffect, useState } from 'react';

/** Missing means enabled so existing accounts keep their current behavior. */
export function useSocialEnabled(): boolean {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEnabled(false);
      return;
    }
    profileRepository.get(user.uid)
      .then((profile) => {
        if (!cancelled) setEnabled(profile?.data.socialEnabled !== false);
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    return () => { cancelled = true; };
  }, [user, dataVersion]);

  return enabled;
}
