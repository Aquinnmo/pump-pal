import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import {
  createPendingExerciseResponse,
  CreatePendingExerciseInput,
} from '@timber/contract/api';

export function createPendingExercise(
  input: CreatePendingExerciseInput,
  opts?: ApiRequestOptions<never>
) {
  return apiRequest('/api/catalog/pending', {
    method: 'POST',
    body: input,
    responseSchema: createPendingExerciseResponse,
    signal: opts?.signal,
  });
}
