import { createFirestoreRestClient, type FirestoreClientDeps } from './firestore-rest-client-core';
import { getAppCheckToken } from './app-check-token';

export * from './firestore-rest-client-core';

export function firestoreRestClient() {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('EXPO_PUBLIC_FIREBASE_PROJECT_ID is required for direct Firestore access.');
  return createFirestoreRestClient({
    projectId,
    fetchImpl: fetch as FirestoreClientDeps['fetchImpl'],
    async getIdToken(forceRefresh = false) {
      const { auth } = await import('@/config/firebase');
      return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
    },
    getAppCheckToken,
  });
}
