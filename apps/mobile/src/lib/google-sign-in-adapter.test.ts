import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';

const auth = { name: 'test-auth' };
let popupError: unknown = null;
let linkedUser = {
  uid: 'user-1',
  providerData: [{ providerId: 'google.com', email: 'person@example.com' }],
};
let popupCalls = 0;
let unlinkCalls: { uid: string; provider: string }[] = [];

mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth }));
mock.module('firebase/auth', () => {
  class GoogleAuthProvider {}

  return {
    GoogleAuthProvider,
    signInWithPopup: async () => {
      popupCalls += 1;
      if (popupError) throw popupError;
      return { user: linkedUser };
    },
    linkWithPopup: async () => {
      popupCalls += 1;
      if (popupError) throw popupError;
      return { user: linkedUser };
    },
    unlink: async (user: { uid: string }, provider: string) => {
      unlinkCalls.push({ uid: user.uid, provider });
    },
  };
});

const { connectGoogleAccount, signInWithGoogle, signOutGoogle } = await import('./google-sign-in.web');

afterEach(() => {
  popupError = null;
  linkedUser = {
    uid: 'user-1',
    providerData: [{ providerId: 'google.com', email: 'person@example.com' }],
  };
  popupCalls = 0;
  unlinkCalls = [];
});

describe('web Google sign-in adapter', () => {
  it('delegates a successful popup and reports completion', async () => {
    assert.equal(await signInWithGoogle(), true);
    assert.equal(popupCalls, 1);
  });

  it('maps popup dismissal to false while preserving other errors', async () => {
    popupError = { code: 'auth/popup-closed-by-user' };
    assert.equal(await signInWithGoogle(), false);

    const error = new Error('provider unavailable');
    popupError = error;
    await assert.rejects(signInWithGoogle(), error);
  });

  it('links a matching Google identity and removes a mismatched link before surfacing the error', async () => {
    const user = { uid: 'user-1', email: 'PERSON@example.com' };
    assert.equal(await connectGoogleAccount(user as never), true);

    linkedUser = {
      uid: 'user-1',
      providerData: [{ providerId: 'google.com', email: 'other@example.com' }],
    };
    await assert.rejects(connectGoogleAccount(user as never), { code: 'auth/google-email-mismatch' });
    assert.deepEqual(unlinkCalls, [{ uid: 'user-1', provider: 'google.com' }]);
  });

  it('keeps web Google sign-out a safe no-op', async () => {
    await signOutGoogle();
    assert.equal(popupCalls, 0);
  });
});
