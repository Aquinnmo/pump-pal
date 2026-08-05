import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { profileDTO, ProfilePatchInput } from '@/shared/api-contract';

export function getProfile(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/profile', { responseSchema: profileDTO, signal: opts?.signal });
}

export function patchProfile(input: ProfilePatchInput, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: input,
    responseSchema: profileDTO,
    conflictEntitySchema: profileDTO,
    signal: opts?.signal,
  });
}
