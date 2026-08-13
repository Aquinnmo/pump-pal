import { getDb } from './client';
import * as workouts from './workouts';
import { Workout, WorkoutStatus } from '@/types/workout';

export const workoutRepository = {
  getAll: async (uid: string) => workouts.getAll(await getDb(), uid),
  getHistory: async (uid: string) => workouts.getHistory(await getDb(), uid),
  getByStatus: async (uid: string, status: WorkoutStatus) =>
    workouts.getByStatus(await getDb(), uid, status),
  getById: async (uid: string, id: string) => workouts.getById(await getDb(), uid, id),
  create: async (uid: string, workout: Omit<Workout, 'id' | 'userId'>) =>
    workouts.create(await getDb(), uid, workout),
  update: async (uid: string, id: string, workout: Workout) =>
    workouts.update(await getDb(), uid, id, workout),
  softDelete: async (uid: string, id: string) => workouts.softDelete(await getDb(), uid, id),
  reorderQueue: async (uid: string, orderedIds: string[]) =>
    workouts.reorderQueue(await getDb(), uid, orderedIds),
};
