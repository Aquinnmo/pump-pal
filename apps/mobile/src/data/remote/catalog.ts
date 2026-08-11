import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import {
  catalogResponse,
  createPendingExerciseResponse,
  CreatePendingExerciseInput,
} from '@timber/contract/api';

export function getCatalog(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/catalog', { responseSchema: catalogResponse, signal: opts?.signal });
}

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
