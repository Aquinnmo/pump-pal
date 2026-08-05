import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { profileDTO, profileResponse, ProfilePatchInput } from '@/shared/api-contract';

export function getProfile(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/profile', { responseSchema: profileResponse, signal: opts?.signal }).then(({ profile }) => profile);
}

export function patchProfile(input: ProfilePatchInput, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: input,
    responseSchema: profileResponse,
    conflictEntitySchema: profileDTO,
    signal: opts?.signal,
  }).then(({ profile }) => profile);
}
