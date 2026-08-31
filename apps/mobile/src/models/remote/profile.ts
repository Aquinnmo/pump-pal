import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { profileDTO, profileResponse, ProfilePatchInput } from '@timber/contract/api';

type PrivilegedProfilePatch = Pick<ProfilePatchInput, 'username' | 'expoPushToken'>;

/** Username and Expo push-token updates are Worker-only; workout splits are direct Firestore. */
export function patchProfile(input: PrivilegedProfilePatch, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: input,
    responseSchema: profileResponse,
    conflictEntitySchema: profileDTO,
    signal: opts?.signal,
  }).then(({ profile }) => {
    if (!profile) throw new Error('Profile PATCH succeeded without a profile document');
    return profile;
  });
}
