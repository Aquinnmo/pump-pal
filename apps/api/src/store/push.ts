import { getDoc } from './rest.js';
import { firestorePaths } from '@timber/contract/firestore';

/**
 * Outbound push, via the Expo Push Service.
 *
 * Deliberately not `firebase-admin` / an FCM SDK: `store/` dropped
 * firebase-admin because its gRPC tree dominated cold start, and re-adding a
 * push SDK would undo that for one notification type. Expo's endpoint is a
 * plain JSON POST, so this is the whole integration.
 *
 * Tokens live at `users/{uid}/private/notifications.expoPushToken`. A user
 * with no token (web, or permission denied)
 * simply isn't deliverable — callers treat that as a normal outcome, not an
 * error, so the underlying action still commits.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  /** Merged into the notification payload for client-side routing. */
  data?: Record<string, string>;
}

/**
 * Sends one push to `toUid`. Returns whether Expo accepted it. Never throws:
 * a failed notification must not fail the action that triggered it.
 */
export async function sendPush(toUid: string, message: PushMessage): Promise<boolean> {
  try {
    const notifications = await getDoc(firestorePaths.privateNotifications(toUid));
    const legacy = notifications ? undefined : await getDoc(firestorePaths.user(toUid), ['expoPushToken']);
    const token = (notifications?.fields.expoPushToken ?? legacy?.fields.expoPushToken) as string | undefined;
    if (!token) return false;

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, sound: 'default', ...message }),
    });
    if (!res.ok) {
      console.error(`sendPush(${toUid}): Expo returned ${res.status}`);
      return false;
    }

    // Expo answers 200 even for a per-message error (e.g. DeviceNotRegistered),
    // so the status alone doesn't mean delivered-to-device.
    const body = (await res.json()) as { data?: { status?: string; message?: string } };
    if (body.data?.status !== 'ok') {
      console.error(`sendPush(${toUid}): ${body.data?.status} ${body.data?.message ?? ''}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`sendPush(${toUid}) failed`, e);
    return false;
  }
}
