import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { patchProfile } from '@/repositories/remote/profile';
import { persistPushToken } from '@/hooks/push-token-registration';

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

const CHOPS_CHANNEL_ID = 'chops';

// Expo suppresses foreground notifications when no handler is installed. A
// Chop is user-visible in every app state, including while the recipient is
// already looking at Timber.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
  handleError: (notificationId, error) => {
    console.warn(`[push] could not present notification ${notificationId}`, error);
  },
});

async function register(uid: string): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHOPS_CHANNEL_ID, {
      name: 'Chops',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) {
    if (__DEV__) console.warn('[push] notification permission was not granted');
    return;
  }

  const projectId = (Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId) as string | undefined;
  if (!projectId) {
    if (__DEV__) console.warn('[push] EAS projectId is missing from the app config');
    return;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  // Expo reissues the same token across launches, so without this check every
  // cold start would spend a write on an unchanged value. The cache is scoped
  // to the signed-in account so switching users on one device cannot leave the
  // new account without its token.
  const changed = await persistPushToken(uid, token, {
    getCachedToken: (key) => AsyncStorage.getItem(key),
    setCachedToken: (key, value) => AsyncStorage.setItem(key, value),
    registerToken: async (value) => void (await patchProfile({ expoPushToken: value })),
  });
  if (__DEV__ && changed) console.log('[push] Expo token registered for the signed-in account');
}

export function usePushToken(): void {
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (!__DEV__) return;
      const type = notification.request.content.data?.type;
      console.log(`[push] received ${typeof type === 'string' ? type : 'remote'} notification`);
    });

    // Best-effort: no permission, no network, or a dev build without push
    // credentials must not block authenticated navigation. The explicit log
    // keeps configuration failures diagnosable in development.
    register(uid).catch((error) => console.warn('[push] token registration failed', error));

    return () => receivedSubscription.remove();
  }, [uid]);
}
