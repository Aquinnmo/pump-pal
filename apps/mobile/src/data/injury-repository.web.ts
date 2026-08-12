import { createVersionCache } from '@/data/version-cache';
import { webFirestore } from './web-direct-firestore';
import { Injury } from '@/types/user';
import { StoredRecord } from '@/data/remote-types';
import { normalizeTimestampsDeep } from './normalize-timestamps';

const versions = createVersionCache();

function toRecord(data: Injury, version: string): StoredRecord<Injury> {
  versions.set(data.id, version);
  return { id: data.id, data, syncState: 'synced', serverVersion: version, updatedAt: String(data.updatedAt), deleted: false };
}

export const injuryRepository = {
  async getAll(uid: string) {
    return (await webFirestore(uid).injuries.list()).map(({ data, version }) => toRecord(data as Injury, version));
  },
  async getById(uid: string, id: string) {
    return (await this.getAll(uid)).find((injury) => injury.id === id) ?? null;
  },
  async create(uid: string, injury: Injury) {
    const result = await webFirestore(uid).injuries.create(normalizeTimestampsDeep(injury) as Injury);
    versions.set(injury.id, result.version);
  },
  async update(uid: string, injury: Injury) {
    const result = await webFirestore(uid).injuries.update(injury.id, normalizeTimestampsDeep(injury) as Injury, versions.require(injury.id, 'injury'));
    versions.set(injury.id, result.version);
  },
  async softDelete(uid: string, id: string) {
    await webFirestore(uid).injuries.delete(id, versions.require(id, 'injury'));
    versions.delete(id);
  },
};
