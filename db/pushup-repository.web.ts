// Web build of db/pushup-repository.ts. Same LocalSingletonRepository<ChallengeData>
// shape as native; every call is a live PUT (full replace, matching the
// existing setDoc semantics documented in types/pushup-challenge.ts).
import { LocalSingletonRepository, StoredRecord } from '@/repositories/types';
import { createVersionCache } from '@/repositories/version-cache';
import * as remote from '@/repositories/remote/pushup';
import { ChallengeData } from '@/types/pushup-challenge';
import { PushupChallengeDTO } from '@/shared/api-contract';

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
  async get(): Promise<StoredRecord<ChallengeData> | null> {
    const dto = await remote.getPushupChallenge();
    return toStoredRecord(dto);
  },

  async upsert(_uid: string, entity: ChallengeData): Promise<void> {
    const dto = await remote.putPushupChallenge({
      startDate: entity.startDate,
      days: entity.days,
      longestStreak: entity.longestStreak,
      baseVersion: versions.get(SINGLETON_ID) ?? null,
    });
    toStoredRecord(dto);
  },
};
