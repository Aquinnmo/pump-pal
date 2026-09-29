import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';

let appleResult: unknown = {
  identityToken: 'apple-token',
  authorizationCode: 'apple-code',
  fullName: { givenName: 'Ada', familyName: 'Lovelace' },
};
let appleError: unknown = null;
let signInOptions: { nonce?: string } | null = null;
let credentialCalls: unknown[] = [];
let linkCalls: unknown[] = [];
let profileUpdates: unknown[] = [];
let revokeCalls: unknown[] = [];
let signedInUser: { uid: string; displayName: string | null } = { uid: 'user-1', displayName: null };
const auth = { currentUser: { uid: 'user-1' } };

// tests/setup.ts resolves @/config/firebase to the web build.
mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth }));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Keep native Apple, crypto, and Firebase at their adapter seams.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'apple-sign-in-test-doubles',
  setup(build: Build) {
    build.module('expo-apple-authentication', () => ({
      exports: {
        AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
        isAvailableAsync: async () => true,
        signInAsync: async (options: { nonce?: string }) => {
          signInOptions = options;
          if (appleError) throw appleError;
          return appleResult;
        },
      },
      loader: 'object',
    }));
    build.module('expo-crypto', () => ({
      exports: {
        CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
        randomUUID: () => 'raw-nonce',
        digestStringAsync: async (_algorithm: string, value: string) => `hashed:${value}`,
      },
      loader: 'object',
    }));
    build.module('firebase/auth', () => ({
      exports: {
        OAuthProvider: class {
          credential(value: unknown) {
            return value;
          }
        },
        signInWithCredential: async (_auth: unknown, credential: unknown) => {
          credentialCalls.push(credential);
          return { user: signedInUser };
        },
        linkWithCredential: async (user: unknown, credential: unknown) => {
          linkCalls.push({ user, credential });
          return { user: { uid: 'user-1' } };
        },
        updateProfile: async (_user: unknown, profile: unknown) => {
          profileUpdates.push(profile);
        },
        revokeAccessToken: async (_auth: unknown, code: unknown) => {
          revokeCalls.push(code);
        },
      },
      loader: 'object',
    }));
  },
});

const { connectAppleAccount, revokeAppleAccess, signInWithApple } = await import('./apple-sign-in');

afterEach(() => {
  appleResult = {
    identityToken: 'apple-token',
    authorizationCode: 'apple-code',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  };
  appleError = null;
  signInOptions = null;
  credentialCalls = [];
  linkCalls = [];
  profileUpdates = [];
  revokeCalls = [];
  signedInUser = { uid: 'user-1', displayName: null };
  auth.currentUser = { uid: 'user-1' };
});

describe('native Apple sign-in adapter', () => {
  it('sends the hashed nonce to Apple and the raw nonce to Firebase', async () => {
    assert.equal(await signInWithApple(), true);
    assert.equal(signInOptions?.nonce, 'hashed:raw-nonce');
    assert.deepEqual(credentialCalls, [{ idToken: 'apple-token', rawNonce: 'raw-nonce' }]);
  });

  it('keeps the first-authorization name only when the account has none', async () => {
    await signInWithApple();
    assert.deepEqual(profileUpdates, [{ displayName: 'Ada Lovelace' }]);

    profileUpdates = [];
    signedInUser = { uid: 'user-1', displayName: 'Existing' };
    await signInWithApple();
    assert.deepEqual(profileUpdates, []);
  });

  it('maps a dismissed sheet to false and reports a missing token', async () => {
    appleError = { code: 'ERR_REQUEST_CANCELED' };
    assert.equal(await signInWithApple(), false);
    assert.equal(credentialCalls.length, 0);

    appleError = null;
    appleResult = { identityToken: null, authorizationCode: null, fullName: null };
    await assert.rejects(signInWithApple(), /Apple did not return an identity token/);
  });

  it('links only while the same user is still signed in', async () => {
    const user = { uid: 'user-1' };
    assert.equal(await connectAppleAccount(user as never), true);
    assert.equal(linkCalls.length, 1);

    auth.currentUser = { uid: 'different-user' };
    await assert.rejects(connectAppleAccount(user as never), { code: 'auth/apple-link-user-changed' });
    assert.equal(linkCalls.length, 1);
  });

  it('revokes with the authorization code, and does nothing when dismissed', async () => {
    assert.equal(await revokeAppleAccess(), true);
    assert.deepEqual(revokeCalls, ['apple-code']);

    appleError = { code: 'ERR_REQUEST_CANCELED' };
    assert.equal(await revokeAppleAccess(), false);
    assert.equal(revokeCalls.length, 1);
  });
});
