const assert = require('node:assert/strict');

const IOS_CLIENT_ID = '123456789012-zyxwvutsrqponmlkjihgfedcba.apps.googleusercontent.com';
const PERSONAL_BUNDLE_ID = 'com.aquinnmo.timber.personal.0123abcdef45';

const baseConfig = {
  name: 'Timber',
  ios: { bundleIdentifier: 'com.aquinnmo.timber' },
  android: { package: 'com.aquinnmo.timber' },
  plugins: ['expo-router'],
};

function evaluateConfig({ bundleId, iosClientId }) {
  const previousBundleId = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  const previousClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (bundleId === undefined) delete process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  else process.env.TIMBER_IOS_BUNDLE_IDENTIFIER = bundleId;
  if (iosClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = iosClientId;
  delete require.cache[require.resolve('./app.config')];
  const config = require('./app.config')({ config: baseConfig });
  if (previousBundleId === undefined) delete process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  else process.env.TIMBER_IOS_BUNDLE_IDENTIFIER = previousBundleId;
  if (previousClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = previousClientId;
  return config;
}

const personal = evaluateConfig({ bundleId: PERSONAL_BUNDLE_ID, iosClientId: IOS_CLIENT_ID });
assert.equal(personal.ios.bundleIdentifier, PERSONAL_BUNDLE_ID);
assert.equal(
  personal.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'),
  false,
  'personal iPhone builds must not include an OAuth URL scheme for another bundle ID',
);

const published = evaluateConfig({ bundleId: undefined, iosClientId: IOS_CLIENT_ID });
assert.equal(
  published.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'),
  true,
  'published builds retain their configured Google Sign-In plugin',
);

console.log('personal iOS build configuration tests passed');
