import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb, purgeUidData } from './client';
import { listAll } from './outbox';
import { syncNow } from './sync';

export type SignOutSafety = { pending: number };

export async function getSignOutSafety(uid: string): Promise<SignOutSafety> {
  const db = await getDb();
  return { pending: (await listAll(db, uid)).length };
}

/** Syncs once, then proves nothing is still queued before sign-out may proceed. */
export async function syncBeforeSignOut(uid: string): Promise<SignOutSafety> {
  await syncNow(uid, uid);
  return getSignOutSafety(uid);
}

/**
 * Erases local rows and all known per-account projections only after the user
 * explicitly discards or after a clean sync. The widget cache is intentionally
 * removed too: it is not uid-keyed and could otherwise show account A to B.
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
