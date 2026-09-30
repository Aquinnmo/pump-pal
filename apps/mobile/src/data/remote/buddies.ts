import { apiRequest, ApiRequestOptions } from '@/lib/api-client';
import {
  SOCIAL_TERMS_VERSION,
  acceptSocialTermsResponse,
  blocksResponse,
  buddiesResponse,
  buddySearchResponse,
  buddyStateResponse,
  chopResponse,
  type ReportReason,
} from '@timber/contract/api';

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

/** Decline an incoming request, cancel an outgoing one, or remove an accepted buddy. */
export function removeBuddy(uid: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/buddies/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    responseSchema: buddyStateResponse,
    signal: opts?.signal,
  });
}

export function acceptSocialTerms(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/social/terms', {
    method: 'POST',
    body: { version: SOCIAL_TERMS_VERSION },
    responseSchema: acceptSocialTermsResponse,
    signal: opts?.signal,
  });
}

/** Also removes any buddy relationship with `uid` server-side. */
export function blockUser(uid: string, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/blocks', { method: 'POST', body: { uid }, signal: opts?.signal });
}

export function unblockUser(uid: string, opts?: ApiRequestOptions<never>) {
  return apiRequest(`/api/blocks/${encodeURIComponent(uid)}`, { method: 'DELETE', signal: opts?.signal });
}

export function getBlocks(opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/blocks', { responseSchema: blocksResponse, signal: opts?.signal }).then(({ blocks }) => blocks);
}

export function reportUser(uid: string, reason: ReportReason, note?: string, opts?: ApiRequestOptions<never>) {
  return apiRequest('/api/reports', {
    method: 'POST',
    body: { uid, reason, ...(note?.trim() ? { note: note.trim() } : {}) },
    signal: opts?.signal,
  });
}
