// Web build of db/profile-repository.ts. Same LocalSingletonRepository<UserDoc>
// shape as native, but `upsert` only ever forwards `workoutSplit` — the wire
// contract's PATCH /api/profile is allowlisted to that field on purpose
// (injuries have their own /api/injuries endpoints, aiUsage is server-owned).
// A caller passing `injuries`/`aiUsage` here is a bug in the call site, not
// something this repo can fix by guessing — those go through the injuries
// repository instead.
import { LocalSingletonRepository, StoredRecord } from '@/repositories/types';
import { createVersionCache } from '@/repositories/version-cache';
import * as remote from '@/repositories/remote/profile';
import { UserDoc } from '@/types/user';
import { ProfileDTO } from '@/shared/api-contract';

const versions = createVersionCache();
const SINGLETON_ID = 'profile';

function toStoredRecord(dto: ProfileDTO): StoredRecord<UserDoc> {
  versions.set(SINGLETON_ID, dto.version);
  return {
    id: SINGLETON_ID,
    data: {
      workoutSplit: dto.workoutSplit
        ? { ...dto.workoutSplit, updatedAt: new Date().toISOString() }
        : undefined,
      aiUsage: dto.aiUsage ?? undefined,
    },
    syncState: 'synced',
    serverVersion: dto.version,
    updatedAt: new Date().toISOString(),
    deleted: false,
  };
}

export const profileRepository: LocalSingletonRepository<UserDoc> = {
  async get(): Promise<StoredRecord<UserDoc> | null> {
    const dto = await remote.getProfile();
    return toStoredRecord(dto);
  },

  async upsert(_uid: string, entity: UserDoc): Promise<void> {
    if (!entity.workoutSplit) return;
    const dto = await remote.patchProfile({
      workoutSplit: { type: entity.workoutSplit.type, custom: entity.workoutSplit.custom },
      baseVersion: versions.get(SINGLETON_ID),
    });
    toStoredRecord(dto);
  },
};
