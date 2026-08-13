import { createVersionCache } from '@/data/version-cache';
import { invalidateWebReads, listWebInjuryRecords, webFirestore } from './web-direct-firestore';
import { Injury } from '@/types/user';
import { StoredRecord } from '@/data/remote-types';
import { normalizeTimestampsDeep } from './normalize-timestamps';
import { toDateObj } from '@/lib/workout-conversion';

const versions = createVersionCache();

function toRecord(data: Injury, version: string): StoredRecord<Injury> {
  versions.set(data.id, version);
  return { id: data.id, data, syncState: 'synced', serverVersion: version, updatedAt: String(data.updatedAt), deleted: false };
}

export const injuryRepository = {
  async getAll(uid: string) {
    // The remote list comes back updatedAt-ascending; native is ORDER BY
    // updated_at DESC (src/data/injuries.ts:18). Sort to match, or web shows
    // injuries oldest-first while the app on a phone shows newest-first.
    return (await listWebInjuryRecords(uid))
      .map(({ data, version }) => toRecord(data as unknown as Injury, version))
      .sort((a, b) => (toDateObj(b.data.updatedAt)?.getTime() ?? 0) - (toDateObj(a.data.updatedAt)?.getTime() ?? 0));
  },
  async getById(uid: string, id: string) {
    return (await this.getAll(uid)).find((injury) => injury.id === id) ?? null;
  },
  async create(uid: string, injury: Injury) {
    const result = await webFirestore(uid).injuries.create(normalizeTimestampsDeep(injury) as Injury);
    versions.set(injury.id, result.version);
    invalidateWebReads();
  },
  async update(uid: string, injury: Injury) {
    const result = await webFirestore(uid).injuries.update(injury.id, normalizeTimestampsDeep(injury) as Injury, versions.require(injury.id, 'injury'));
    versions.set(injury.id, result.version);
    invalidateWebReads();
  },
  async softDelete(uid: string, id: string) {
    await webFirestore(uid).injuries.delete(id, versions.require(id, 'injury'));
    versions.delete(id);
    invalidateWebReads();
  },
};
