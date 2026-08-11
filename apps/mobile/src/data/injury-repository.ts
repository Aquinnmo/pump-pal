import { getDb } from './client';
import * as injuries from './injuries';
import { Injury } from '@/types/user';

export const injuryRepository = {
  getAll: async (uid: string) => injuries.getAll(await getDb(), uid),
  getById: async (uid: string, id: string) => injuries.getById(await getDb(), uid, id),
  create: async (uid: string, injury: Injury) => injuries.create(await getDb(), uid, injury),
  update: async (uid: string, injury: Injury) => injuries.update(await getDb(), uid, injury),
  softDelete: async (uid: string, id: string) => injuries.softDelete(await getDb(), uid, id),
};
