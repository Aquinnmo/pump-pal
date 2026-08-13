import assert from 'node:assert/strict';
import { getFriendlyAuthError } from './firebase-errors.js';

assert.equal(
  getFriendlyAuthError({ code: 'auth/account-exists-with-different-credential' }),
  'This email already has a Timber password. Sign in with your password, then connect Google from Account Settings.'
);
assert.equal(
  getFriendlyAuthError({ code: 'auth/credential-already-in-use' }),
  'This Google account is already linked to a different Timber account. Sign in to that account instead.'
);
assert.equal(getFriendlyAuthError({ code: 'auth/provider-already-linked' }), 'Google is already connected to this account.');
assert.equal(
  getFriendlyAuthError({ code: 'auth/google-email-mismatch' }),
  'The selected Google email does not match this Timber account.'
);
assert.equal(
  getFriendlyAuthError({ code: 'auth/google-link-user-changed' }),
  'Your signed-in account changed while Google was connecting. Try again.'
);
assert.equal(getFriendlyAuthError({ code: 'auth/popup-closed-by-user' }), 'Sign-in was cancelled.');
assert.equal(getFriendlyAuthError({ code: 'unrecognized' }), 'Internal error. Please try again later.');

console.log('firebase error mapping tests passed');
