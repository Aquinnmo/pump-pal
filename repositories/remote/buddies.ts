import { apiRequest, ApiRequestOptions } from '@/utils/api-client';
import { buddiesResponse, buddySearchResponse, chopResponse } from '@/shared/api-contract';

/**
 * Timber Buddies. Every call is server-only by necessity — `firestore.rules`
 * denies clients any read of another user's doc, so there is no offline or
 * cached path here the way there is for the user's own workouts.
 */

export function searchUsers(q: string, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/buddies/search', {
    query: { q },
    responseSchema: buddySearchResponse,
    signal: opts?.signal,
  }).then(({ results }) => results);
}

/** `today` is the caller's LOCAL date — it decides which buddies count as having trained. */
export function getBuddies(today: string, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/buddies', {
    query: { today },
    responseSchema: buddiesResponse,
    signal: opts?.signal,
  });
}

export function sendBuddyRequest(uid: string, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/buddies', { method: 'POST', body: { uid }, signal: opts?.signal });
}

export function acceptBuddyRequest(uid: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/buddies/${encodeURIComponent(uid)}`, {
    method: 'POST',
    body: { action: 'accept' },
    signal: opts?.signal,
  });
}

export function chopBuddy(uid: string, today: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/buddies/${encodeURIComponent(uid)}/chop`, {
    method: 'POST',
    body: { today },
    responseSchema: chopResponse,
    signal: opts?.signal,
  });
}
