import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import { aiQuotaStatus } from '@timber/contract/ai';

/**
 * How many AI credits the signed-in user has left today, straight from the
 * server that enforces the cap (`apps/api/src/store/quota.ts`).
 *
 * Server-only by necessity: the limit itself lives on the server, so any client
 * that computes `LIMIT - count` from a bundled constant shows a stale number
 * after the cap changes. There is no offline path here — see `use-ai-quota.ts`
 * for what the UI does when this cannot be reached.
 */
export function getAIQuota(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/ai/quota', { responseSchema: aiQuotaStatus, signal: opts?.signal });
}
