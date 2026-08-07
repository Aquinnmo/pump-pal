import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { manifestResponse, pullResponse, ListQuery, PullRequest } from '@/shared/api-contract';

export function getManifest(query?: ListQuery, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/sync/manifest', {
    query,
    responseSchema: manifestResponse,
    signal: opts?.signal,
  });
}

export function pull(request: PullRequest, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/sync/pull', {
    method: 'POST',
    body: request,
    responseSchema: pullResponse,
    signal: opts?.signal,
  });
}
