// Web build of src/data/pushup-repository.ts. Same LocalSingletonRepository<ChallengeData>
// shape as native; every call is a live PUT (full replace, matching the
// existing setDoc semantics documented in src/types/pushup-challenge.ts).
import { LocalSingletonRepository, StoredRecord } from '@/data/remote-types';
import { createVersionCache } from '@/data/version-cache';
import { invalidateWebReads, readWebPushup, webFirestore } from './web-direct-firestore';
import { ChallengeData } from '@/types/pushup-challenge';
import { PushupChallengeDTO } from '@timber/contract/api';

const versions = createVersionCache();
const SINGLETON_ID = 'pushup_challenge';

function toStoredRecord(dto: PushupChallengeDTO): StoredRecord<ChallengeData> | null {
  if (dto.startDate == null) return null; // "no active challenge", same non-existence handling as native
  if (dto.version) versions.set(SINGLETON_ID, dto.version);
  return {
    id: SINGLETON_ID,
    data: { startDate: dto.startDate, days: dto.days, longestStreak: dto.longestStreak },
    syncState: 'synced',
    serverVersion: dto.version,
    updatedAt: new Date().toISOString(),
    deleted: false,
  };
}

export const pushupRepository: LocalSingletonRepository<ChallengeData> = {
  async get(uid: string): Promise<StoredRecord<ChallengeData> | null> {
    return toStoredRecord((await readWebPushup(uid)).data);
  },

  async upsert(_uid: string, entity: ChallengeData): Promise<void> {
    const dto = (await webFirestore(_uid).pushup.write(entity, versions.get(SINGLETON_ID) ?? null)).data;
    toStoredRecord(dto);
    invalidateWebReads();
  },
};
