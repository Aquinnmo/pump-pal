import * as remote from '@/data/remote/injuries';
import { Injury } from '@/types/user';
import { StoredRecord } from '@/data/remote-types';
import { normalizeTimestampsDeep } from './normalize-timestamps';

function toRecord(data: Injury, version: string | null = null): StoredRecord<Injury> {
  return { id: data.id, data, syncState: 'synced', serverVersion: version, updatedAt: String(data.updatedAt), deleted: false };
}

export const injuryRepository = {
  async getAll(_uid: string) {
    const response = await remote.listInjuries();
    return response.injuries.map((injury) => toRecord(injury as Injury, response.version));
  },
  async getById(uid: string, id: string) {
    return (await this.getAll(uid)).find((injury) => injury.id === id) ?? null;
  },
  async create(_uid: string, injury: Injury) {
    await remote.createInjury(normalizeTimestampsDeep(injury) as never);
  },
  async update(_uid: string, injury: Injury) {
    await remote.updateInjury(injury.id, normalizeTimestampsDeep(injury) as never);
  },
  async softDelete(_uid: string, id: string) {
    await remote.deleteInjury(id);
  },
};
