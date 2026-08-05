import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import {
  injuryDTO,
  injuriesListResponse,
  injuryMutationResponse,
  injuryHistoryOpResponse,
  CreateInjuryInput,
  UpdateInjuryInput,
} from '@/shared/api-contract';

export function listInjuries(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/injuries', { responseSchema: injuriesListResponse, signal: opts?.signal });
}

export function createInjury(input: CreateInjuryInput, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/injuries', {
    method: 'POST',
    body: input,
    responseSchema: injuryMutationResponse,
    signal: opts?.signal,
  });
}

export function updateInjury(id: string, input: UpdateInjuryInput, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/injuries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    responseSchema: injuryMutationResponse,
    conflictEntitySchema: injuryDTO,
    signal: opts?.signal,
  });
}

/** Not in the published contract as its own zod schema — REST convention, deletes the injury record itself (distinct from remove-from-history's arrayRemove). */
export function deleteInjury(id: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/injuries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: opts?.signal,
  });
}

export function applyInjuryToHistory(id: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/injuries/${encodeURIComponent(id)}/apply-to-history`, {
    method: 'POST',
    responseSchema: injuryHistoryOpResponse,
    signal: opts?.signal,
  });
}

export function removeInjuryFromHistory(id: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/injuries/${encodeURIComponent(id)}/remove-from-history`, {
    method: 'POST',
    responseSchema: injuryHistoryOpResponse,
    signal: opts?.signal,
  });
}
