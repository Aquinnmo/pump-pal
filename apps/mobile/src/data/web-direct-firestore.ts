import { firestoreRestClient } from '@/lib/firestore-rest-client';
import { createFirestoreSyncRemote, getApprovedCatalogSnapshot } from './firestore-sync-remote';
import { createReadCache } from './web-read-cache';
import type { InjuryDTO, ProfileDTO, PushupChallengeDTO, WorkoutDTO } from '@timber/contract/api';

// One cache for every direct read the web repositories make. The catalog is
// deliberately absent: src/lib/catalog-loader.ts already memoizes it per session.
const reads = createReadCache();

/**
 * Drops every cached read. Called by each web repository after a write, and by
 * purgeLocalAccountData() on sign-out. Clearing everything rather than the one
 * touched key is intentional — per-key invalidation buys nothing here and costs
 * a correctness argument at every call site.
 */
export function invalidateWebReads(): void {
  reads.clear();
}

export function webFirestore(uid: string) {
  return createFirestoreSyncRemote(firestoreRestClient(), uid);
}

/**
 * The cached unit is the raw list — entity plus its version — so the repository
 * that needs versions for its next write and the callers that only want the
 * entities share one request instead of issuing the same query twice.
 */
function listRecords(uid: string, kind: 'workout' | 'injury') {
  return reads.read(`${kind}:${uid}`, async () => {
    const direct = webFirestore(uid);
    return kind === 'workout' ? direct.workouts.list() : direct.injuries.list();
  }) as Promise<{ version: string; data: WorkoutDTO | InjuryDTO }[]>;
}

export async function listWebEntities(uid: string, kind: 'workout' | 'injury') {
  return (await listRecords(uid, kind)).map((item) => item.data);
}

export function listWebInjuryRecords(uid: string): Promise<{ version: string; data: InjuryDTO }[]> {
  return listRecords(uid, 'injury') as Promise<{ version: string; data: InjuryDTO }[]>;
}

export function readWebProfile(uid: string): Promise<{ version: string; data: ProfileDTO } | undefined> {
  return reads.read(`profile:${uid}`, () => webFirestore(uid).profile.get());
}

export function readWebPushup(uid: string): Promise<{ version: string | null; data: PushupChallengeDTO }> {
  return reads.read(`pushup:${uid}`, () => webFirestore(uid).pushup.read());
}

export const getWebCatalog = () => getApprovedCatalogSnapshot(firestoreRestClient());
