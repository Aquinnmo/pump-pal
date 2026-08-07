import assert from 'node:assert/strict';
import {
  assertGoogleLinkIdentity,
  GoogleLinkEmailMismatchError,
  GoogleLinkUserChangedError,
  googleProviderEmail,
  hasGoogleProvider,
} from './google-account-link';

async function main() {
  const providers = [
    { providerId: 'password', email: 'lifter@example.com' },
    { providerId: 'google.com', email: 'Lifter@Example.com' },
  ];

  assert.equal(hasGoogleProvider(providers), true);
  assert.equal(hasGoogleProvider([{ providerId: 'password' }]), false);
  assert.equal(googleProviderEmail(providers), 'Lifter@Example.com');

  assert.doesNotThrow(() =>
    assertGoogleLinkIdentity({
      expectedUid: 'password-user',
      linkedUid: 'password-user',
      accountEmail: 'lifter@example.com',
      googleEmail: 'LIFTER@example.com',
    })
  );

  assert.throws(
    () =>
      assertGoogleLinkIdentity({
        expectedUid: 'password-user',
        linkedUid: 'password-user',
        accountEmail: 'lifter@example.com',
        googleEmail: 'other@example.com',
      }),
    GoogleLinkEmailMismatchError
  );

  assert.throws(
    () =>
      assertGoogleLinkIdentity({
        expectedUid: 'password-user',
        linkedUid: 'different-user',
        accountEmail: 'lifter@example.com',
        googleEmail: 'lifter@example.com',
      }),
    GoogleLinkUserChangedError
  );

  console.log('utils/google-account-link.test.ts: all assertions passed');
}

main();
