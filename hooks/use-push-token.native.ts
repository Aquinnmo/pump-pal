import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { patchProfile } from '@/repositories/remote/profile';

/**
 * Registers this device's Expo push token on `users/{uid}.expoPushToken`, so
 * the server can deliver a Chop (see api/_lib/store/push.ts).
 *
 * Runs from the authenticated tab shell rather than the Social screen: a chop
 * has to reach people who never open Social, and gating registration on
 * visiting one tab would silently make them undeliverable.
 *
 * Coexists with notifee (utils/streak-notification.native.ts), which owns
 * *local* scheduled reminders. This module only ever deals with the remote
 * token; it schedules nothing.
 */

const CACHE_KEY = 'pumppal_expo_push_token';

async function register(): Promise<void> {
  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  // Expo reissues the same token across launches, so without this check every
  // cold start would spend a write on an unchanged value.
  if ((await AsyncStorage.getItem(CACHE_KEY)) === token) return;

  await patchProfile({ expoPushToken: token });
  await AsyncStorage.setItem(CACHE_KEY, token);
}

export function usePushToken(): void {
  useEffect(() => {
    // Best-effort: no permission, no network, or a dev build without push
    // credentials should never surface as an error in the UI.
    register().catch((e) => console.warn('push token registration failed', e));
  }, []);
}
