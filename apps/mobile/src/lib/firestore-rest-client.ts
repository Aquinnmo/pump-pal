import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { createFirestoreRestClient, type FirestoreClientDeps } from './firestore-rest-client-core';
import { getAppCheckToken } from './app-check-token';

export * from './firestore-rest-client-core';

async function getIdToken(forceRefresh = false): Promise<string | null> {
  const { auth } = await import('@/config/firebase');
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
}

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

function devLog(entry: Parameters<NonNullable<FirestoreClientDeps['log']>>[0]): void {
  if (!__DEV__) return;
  const suffix = [entry.error, entry.retried ? 'tokenRefreshed=true' : undefined].filter(Boolean).join(' ');
  const line = `[firestore] ${entry.method} ${entry.url} -> ${entry.status ?? '(no response)'}`;
  if (suffix) console.warn(`${line} ${suffix}`);
  else console.log(line);
}

export function firestoreRestClient() {
  if (!projectId) throw new Error('EXPO_PUBLIC_FIREBASE_PROJECT_ID is required for direct Firestore access.');
  return createFirestoreRestClient({
    projectId,
    fetchImpl: expoFetch as FirestoreClientDeps['fetchImpl'],
    getIdToken,
    getAppCheckToken,
    log: devLog,
  });
}
