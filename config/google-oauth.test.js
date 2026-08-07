const assert = require('node:assert/strict');
const { getGoogleOAuthConfig, parseGoogleOAuthClientId } = require('./google-oauth');

const WEB_CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';
const IOS_CLIENT_ID = '123456789012-zyxwvutsrqponmlkjihgfedcba.apps.googleusercontent.com';

assert.equal(parseGoogleOAuthClientId(undefined, 'GOOGLE_ID'), undefined);
assert.equal(parseGoogleOAuthClientId('', 'GOOGLE_ID'), undefined);
assert.equal(parseGoogleOAuthClientId(WEB_CLIENT_ID, 'GOOGLE_ID'), WEB_CLIENT_ID);

assert.deepEqual(
  getGoogleOAuthConfig({
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: WEB_CLIENT_ID,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: IOS_CLIENT_ID,
  }),
  { webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID },
);

assert.throws(
  () => parseGoogleOAuthClientId('1:123456789012:web:abc123', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  /Firebase App IDs.*not OAuth client IDs/,
);

assert.throws(
  () => parseGoogleOAuthClientId(`${IOS_CLIENT_ID} # iOS`, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  /apps\.googleusercontent\.com/,
);

assert.throws(
  () => parseGoogleOAuthClientId(` ${WEB_CLIENT_ID}`, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  /whitespace or inline comments/,
);

console.log('google OAuth configuration tests passed');
