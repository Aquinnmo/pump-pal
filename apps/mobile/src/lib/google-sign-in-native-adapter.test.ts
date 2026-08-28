import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'bun:test';

let signInResult: unknown = {
  type: 'success',
  data: { idToken: 'native-token', user: { email: 'person@example.com' } },
};
let playServicesError: unknown = null;
let configureCalls: unknown[] = [];
let credentialCalls: unknown[] = [];
let linkCalls: unknown[] = [];
let signOutCalls = 0;
let signOutError: unknown = null;
const auth = { currentUser: { uid: 'user-1' } };

mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth }));

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// Keep native Google and Firebase APIs at their adapter seams; no native picker
// or installed provider is needed to exercise the cancellation/error contract.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'google-sign-in-native-adapter-test-doubles',
  setup(build: Build) {
    build.module('@react-native-google-signin/google-signin', () => ({
      exports: {
        GoogleSignin: {
          configure: (value: unknown) => { configureCalls.push(value); },
          hasPlayServices: async () => {
            if (playServicesError) throw playServicesError;
          },
          signIn: async () => signInResult,
          signOut: async () => {
            signOutCalls += 1;
            if (signOutError) throw signOutError;
          },
        },
      },
      loader: 'object',
    }));
    build.module('firebase/auth', () => ({
      exports: {
        GoogleAuthProvider: class {
          static credential(token: string) {
            return { token };
          }
        },
        signInWithCredential: async (_auth: unknown, credential: unknown) => {
          credentialCalls.push(credential);
        },
        linkWithCredential: async (user: unknown, credential: unknown) => {
          linkCalls.push({ user, credential });
          return { user: { uid: 'user-1' } };
        },
      },
      loader: 'object',
    }));
  },
});

const { connectGoogleAccount, signInWithGoogle, signOutGoogle } = await import('./google-sign-in');

afterEach(() => {
  signInResult = {
    type: 'success',
    data: { idToken: 'native-token', user: { email: 'person@example.com' } },
  };
  playServicesError = null;
  configureCalls = [];
  credentialCalls = [];
  linkCalls = [];
  signOutCalls = 0;
  signOutError = null;
  auth.currentUser = { uid: 'user-1' };
});

describe('native Google sign-in adapter', () => {
  it('configures the native provider and delegates a successful sign-in token', async () => {
    assert.equal(configureCalls.length, 1);
    assert.equal(await signInWithGoogle(), true);
    assert.deepEqual(credentialCalls, [{ token: 'native-token' }]);
  });

  it('maps native picker cancellation to false and reports missing tokens', async () => {
    signInResult = { type: 'cancelled' };
    assert.equal(await signInWithGoogle(), false);

    signInResult = { type: 'success', data: { idToken: null, user: { email: 'person@example.com' } } };
    await assert.rejects(signInWithGoogle(), /Google did not return an ID token/);
  });

  it('delegates account linking only after the native identity checks pass', async () => {
    const user = { uid: 'user-1', email: 'person@example.com' };
    assert.equal(await connectGoogleAccount(user as never), true);
    assert.equal(linkCalls.length, 1);

    auth.currentUser = { uid: 'different-user' };
    await assert.rejects(connectGoogleAccount(user as never), { code: 'auth/google-link-user-changed' });
    assert.equal(linkCalls.length, 1);
  });

  it('swallows native Google sign-out cleanup errors', async () => {
    signOutError = new Error('native cleanup unavailable');
    await signOutGoogle();
    assert.equal(signOutCalls, 1);
  });
});
