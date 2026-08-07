import { useSyncExternalStore } from 'react';
import { getDataVersion, subscribeDataVersion } from '@/db/data-version';

/**
 * The current local-data version (see db/data-version.ts). Put it in a
 * useFocusEffect/useCallback dep list and the loader re-runs when a sync lands
 * rows underneath a screen that is already focused.
 */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion);
}
