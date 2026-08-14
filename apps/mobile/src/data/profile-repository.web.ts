// Web build of src/data/profile-repository.ts. Same LocalSingletonRepository<UserDoc>
// shape as native, but `upsert` only ever forwards `workoutSplit` and
// `aiEnabled` — the direct Firestore rules allowlist those two fields on purpose
// (injuries have their own repository, and aiUsage is server-owned).
// A caller passing `injuries`/`aiUsage` here is a bug in the call site, not
// something this repo can fix by guessing — those go through the injuries
// repository instead.
import { LocalSingletonRepository, StoredRecord } from '@/data/remote-types';
import { createVersionCache } from '@/data/version-cache';
import { invalidateWebReads, readWebProfile, webFirestore } from './web-direct-firestore';
import { UserDoc } from '@/types/user';
import { ProfileDTO } from '@timber/contract/api';

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
      username: dto.username ?? undefined,
      usernameLower: dto.username ? dto.username.toLowerCase() : undefined,
      aiUsage: dto.aiUsage ?? undefined,
      aiEnabled: dto.aiEnabled ?? undefined,
    },
    syncState: 'synced',
    serverVersion: dto.version,
    updatedAt: new Date().toISOString(),
    deleted: false,
  };
}

export const profileRepository: LocalSingletonRepository<UserDoc> = {
  async get(uid: string): Promise<StoredRecord<UserDoc> | null> {
    const profile = await readWebProfile(uid);
    return profile ? toStoredRecord(profile.data) : null;
  },

  async upsert(_uid: string, entity: UserDoc): Promise<void> {
    // Each field is forwarded only when the caller actually set it, so a
    // split-only upsert never rewrites the AI opt-in (and vice versa).
    const patch = {
      ...(entity.workoutSplit ? { workoutSplit: { type: entity.workoutSplit.type, custom: entity.workoutSplit.custom } } : {}),
      ...(entity.aiEnabled === undefined ? {} : { aiEnabled: entity.aiEnabled }),
    };
    if (Object.keys(patch).length === 0) return;
    const dto = (await webFirestore(_uid).profile.write(patch, versions.get(SINGLETON_ID) ?? null)).data;
    toStoredRecord(dto);
    invalidateWebReads();
  },
};
