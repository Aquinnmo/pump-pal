import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { injuryHistoryOpResponse } from '@timber/contract/api';

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
