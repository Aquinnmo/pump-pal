import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeUidData } from './client';
import { syncNow } from './sync';

/**
 * One last push before the local data is purged. Best-effort on purpose: a
 * failure here must never strand the user signed in on a device that cannot
 * reach the server. Whatever did not make it goes with the purge.
 */
export async function syncBeforeSignOut(uid: string): Promise<void> {
  try {
    await syncNow(uid, uid);
  } catch (err) {
    console.warn('[sign-out] final sync failed, signing out anyway:', err);
  }
}

/**
 * Erases local rows and all known per-account projections. The widget cache is
 * intentionally removed too: it is not uid-keyed and could otherwise show
 * account A to B.
 */
export async function purgeLocalAccountData(uid: string): Promise<void> {
  await purgeUidData(uid);
  const keys = await AsyncStorage.getAllKeys();
  const uidKeys = keys.filter((key) => key.includes(uid));
  const sharedAccountProjections = [
    'pumppal_up_next_widget_v1',
    'pumppal_catalog_v2',
    'pumppal_catalog_version_v2',
  ];
  await AsyncStorage.multiRemove([...new Set([...uidKeys, ...sharedAccountProjections])]);
}
