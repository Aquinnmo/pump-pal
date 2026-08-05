import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { pushupChallengeDTO, PutPushupChallengeInput } from '@/shared/api-contract';

export function getPushupChallenge(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/pushup-challenge', {
    responseSchema: pushupChallengeDTO,
    signal: opts?.signal,
  });
}

export function putPushupChallenge(
  input: PutPushupChallengeInput,
  opts?: ApiRequestOptions<never>
) {
  return apiRequest('/api/pushup-challenge', {
    method: 'PUT',
    body: input,
    responseSchema: pushupChallengeDTO,
    conflictEntitySchema: pushupChallengeDTO,
    signal: opts?.signal,
  });
}
