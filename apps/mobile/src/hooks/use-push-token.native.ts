import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { auth } from '@/config/firebase';
import { patchProfile } from '@/data/remote/profile';

/**
 * Registers this device's Expo push token on
 * `users/{uid}/private/notifications.expoPushToken`, so the server can
 * deliver a Chop (see apps/api/src/store/push.ts).
 *
 * Runs from the authenticated tab shell rather than the Social screen: a chop
 * has to reach people who never open Social, and gating registration on
 * visiting one tab would silently make them undeliverable.
 *
 * Coexists with notifee (src/lib/streak-notification.native.ts), which owns
 * *local* scheduled reminders. This module only ever deals with the remote
 * token; it schedules nothing.
 */

const CACHE_KEY = 'pumppal_expo_push_token';

// Without a handler, a chop that lands while Timber is foregrounded is
// silently dropped on both platforms.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function register(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  // Expo reissues the same token across launches, so without this check every
  // cold start would spend a write on an unchanged value. Keyed by uid too: an
  // account switch on the same device must still register the new account.
  const cached = `${uid}:${token}`;
  if ((await AsyncStorage.getItem(CACHE_KEY)) === cached) return;

  await patchProfile({ expoPushToken: token });
  await AsyncStorage.setItem(CACHE_KEY, cached);
}

export function usePushToken(): void {
  useEffect(() => {
    // Best-effort: no permission, no network, or a build without push
    // capability (e.g. a free personal-team iOS build) should never surface
    // as an error in the UI.
    register().catch((e) => console.warn('push token registration failed', e));
  }, []);
}
