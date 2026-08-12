import { firestoreRestClient } from '@/lib/firestore-rest-client';
import { createFirestoreSyncRemote, getApprovedCatalogSnapshot } from './firestore-sync-remote';

export function webFirestore(uid: string) {
  return createFirestoreSyncRemote(firestoreRestClient(), uid);
}

export async function listWebEntities(uid: string, kind: 'workout' | 'injury') {
  const direct = webFirestore(uid);
  return kind === 'workout'
    ? (await direct.workouts.list()).map((item) => item.data)
    : (await direct.injuries.list()).map((item) => item.data);
}

export const getWebCatalog = () => getApprovedCatalogSnapshot(firestoreRestClient());
