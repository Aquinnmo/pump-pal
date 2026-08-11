import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { pushupChallengeDTO, pushupChallengeResponse, PutPushupChallengeInput } from '@timber/contract/api';

export function getPushupChallenge(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/pushup-challenge', {
    responseSchema: pushupChallengeResponse,
    signal: opts?.signal,
  }).then(({ challenge }) => challenge);
}

export function putPushupChallenge(
  input: PutPushupChallengeInput,
  opts?: ApiRequestOptions<never>
) {
  return apiRequest('/api/pushup-challenge', {
    method: 'PUT',
    body: input,
    responseSchema: pushupChallengeResponse,
    // Not the wrapper: the 409 body carries a *bare* DTO under `remote`.
    conflictEntitySchema: pushupChallengeDTO,
    signal: opts?.signal,
  }).then(({ challenge }) => challenge);
}
