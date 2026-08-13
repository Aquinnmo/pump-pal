import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { deleteAccountDataResponse } from '@timber/contract/api';

/** DELETE /api/account/data — server-side purge (see packages/contract/src/api-contract.ts's doc comment). Auth account deletion stays a separate client Auth call afterward. */
export function deleteAccountData(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/account/data', {
    method: 'DELETE',
    responseSchema: deleteAccountDataResponse,
    signal: opts?.signal,
  });
}
