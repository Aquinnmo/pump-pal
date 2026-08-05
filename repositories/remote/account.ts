import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { deleteAccountDataResponse } from '@/shared/api-contract';

/** DELETE /api/account/data — server-side purge (see shared/api-contract.ts's doc comment). Auth account deletion stays a separate client Auth call afterward. */
export function deleteAccountData(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/account/data', {
    method: 'DELETE',
    responseSchema: deleteAccountDataResponse,
    signal: opts?.signal,
  });
}
