import { getDoc } from './rest.js';

/**
 * Outbound push, via the Expo Push Service.
 *
 * Deliberately not `firebase-admin` / an FCM SDK: `store/` dropped
 * firebase-admin because its gRPC tree dominated cold start, and re-adding a
 * push SDK would undo that for one notification type. Expo's endpoint is a
 * plain JSON POST, so this is the whole integration.
 *
 * Tokens live on `users/{uid}.expoPushToken`, written by the client through
 * `PATCH /api/profile`. A user with no token (web, or permission denied)
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

interface PushTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface PushDeps {
  loadToken: (uid: string) => Promise<string | undefined>;
  fetch: typeof fetch;
  log: Pick<Console, 'info' | 'warn' | 'error'>;
}

const defaultDeps: PushDeps = {
  loadToken: async (uid) => {
    const user = await getDoc(`users/${uid}`, ['expoPushToken']);
    return user?.fields.expoPushToken as string | undefined;
  },
  fetch,
  log: console,
};

/**
 * Sends one push to `toUid`. Returns whether Expo accepted it. Never throws:
 * a failed notification must not fail the action that triggered it.
 */
export async function sendPush(
  toUid: string,
  message: PushMessage,
  deps: PushDeps = defaultDeps
): Promise<boolean> {
  try {
    const token = await deps.loadToken(toUid);
    if (!token) {
      deps.log.warn(`[push] ${toUid}: no registered Expo push token`);
      return false;
    }

    const res = await deps.fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        priority: 'high',
        channelId: 'chops',
        ...message,
      }),
    });
    if (!res.ok) {
      deps.log.error(`[push] ${toUid}: Expo returned HTTP ${res.status}`);
      return false;
    }

    // Expo answers 200 even for a per-message error (e.g. DeviceNotRegistered),
    // so the status alone doesn't mean delivered-to-device.
    const body = (await res.json()) as { data?: PushTicket };
    const ticket = body.data;
    if (ticket?.status !== 'ok') {
      const detail = ticket?.details?.error ? ` (${ticket.details.error})` : '';
      deps.log.error(
        `[push] ${toUid}: Expo rejected ticket: ${ticket?.message ?? ticket?.status ?? 'invalid response'}${detail}`
      );
      return false;
    }

    // A ticket means Expo accepted the request, not that FCM/APNs delivered it.
    // Keeping its id in server logs makes a later receipt lookup possible.
    deps.log.info(`[push] ${toUid}: Expo accepted ticket ${ticket.id ?? '(no receipt id)'}`);
    return true;
  } catch (e) {
    deps.log.error(`[push] ${toUid}: request failed`, e);
    return false;
  }
}
