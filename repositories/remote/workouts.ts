// Raw typed HTTP calls for /api/workouts, against shared/api-contract.ts.
// Used by web repositories (repositories/workout-repository.web.ts) directly
// and by the native sync engine (bead pump-pal-bkp.6) as its "remote"
// adapter — neither talks to fetch/Firestore directly.
import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import {
  workoutDTO,
  listResponse,
  CreateWorkoutInput,
  UpdateWorkoutInput,
  ReorderWorkoutsInput,
  ListWorkoutsQuery,
  WorkoutDTO,
} from '@/shared/api-contract';

const listWorkoutsResponse = listResponse(workoutDTO);

export function listWorkouts(query?: ListWorkoutsQuery, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/workouts', {
    query,
    responseSchema: listWorkoutsResponse,
    signal: opts?.signal,
  });
}

export function getWorkout(id: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/workouts/${encodeURIComponent(id)}`, {
    responseSchema: workoutDTO,
    signal: opts?.signal,
  });
}

export function createWorkout(input: CreateWorkoutInput, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/workouts', {
    method: 'POST',
    body: input,
    responseSchema: workoutDTO,
    conflictEntitySchema: workoutDTO,
    signal: opts?.signal,
  });
}

export function updateWorkout(
  id: string,
  input: UpdateWorkoutInput,
  opts?: ApiRequestOptions<never>
) {
  return apiRequest(`/api/workouts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    responseSchema: workoutDTO,
    conflictEntitySchema: workoutDTO,
    signal: opts?.signal,
  });
}

/** Not in the published contract as its own zod schema (no request body needed) — REST convention, baseVersion via query for the 409 check. */
export function deleteWorkout(id: string, baseVersion: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/workouts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { baseVersion },
    conflictEntitySchema: workoutDTO,
    signal: opts?.signal,
  });
}

export function reorderWorkouts(input: ReorderWorkoutsInput, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/workouts/reorder', {
    method: 'PATCH',
    body: input,
    signal: opts?.signal,
  });
}

export type { WorkoutDTO };
