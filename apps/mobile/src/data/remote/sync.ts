import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { manifestResponse, pullResponse, ListQuery, PullRequest } from '@timber/contract/api';

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
