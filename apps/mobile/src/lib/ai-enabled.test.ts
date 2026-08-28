import assert from 'node:assert/strict';
import type { StoredRecord } from '@/data/remote-types';
import type { UserDoc } from '@/types/user';

type Profile = StoredRecord<UserDoc> | null;

let currentProfile: Profile = null;
let readCalls = 0;
let readError: unknown = null;

function profile(data: UserDoc): StoredRecord<UserDoc> {
  return {
    id: 'profile',
    data,
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-08-27T00:00:00.000Z',
    deleted: false,
  };
}

const { isAIEnabled } = await import('./ai-enabled');
const { profileRepository } = await import('@/data/profile-repository');
const originalGet = profileRepository.get;
profileRepository.get = async () => {
  readCalls += 1;
  if (readError) throw readError;
  return currentProfile;
};

// Missing identity is fail-closed and must not perform a profile read.
readCalls = 0;
assert.equal(await isAIEnabled(undefined), false);
assert.equal(readCalls, 0, 'no uid does not read a profile');
assert.equal(await isAIEnabled(''), false);
assert.equal(readCalls, 0, 'an empty uid does not read a profile');

// Every unknown profile state is disabled: no row, an absent field, or an
// unavailable read cannot opt an account into sending data to AI.
currentProfile = null;
assert.equal(await isAIEnabled('user-1'), false, 'a missing profile row is disabled');

currentProfile = profile({});
assert.equal(await isAIEnabled('user-1'), false, 'an absent preference is disabled');

readError = new Error('profile unavailable');
assert.equal(await isAIEnabled('user-1'), false, 'a profile read error is disabled');
readError = null;

// Only an explicit true enables AI; an explicit false remains disabled.
currentProfile = profile({ aiEnabled: false });
assert.equal(await isAIEnabled('user-1'), false);
currentProfile = profile({ aiEnabled: true });
assert.equal(await isAIEnabled('user-1'), true);

profileRepository.get = originalGet;

console.log('ai-enabled: all assertions passed');
