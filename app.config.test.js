const assert = require('node:assert/strict');
const staticConfig = require('./app.json').expo;
const googleServices = require('./google-services.json');

const IOS_CLIENT_ID = '123456789012-zyxwvutsrqponmlkjihgfedcba.apps.googleusercontent.com';
const PERSONAL_BUNDLE_ID = 'com.aquinnmo.timber.personal.0123abcdef45';

const baseConfig = {
  name: 'Timber',
  ios: { bundleIdentifier: 'com.aquinnmo.timber' },
  android: { package: 'com.aquinnmo.timber' },
  plugins: ['expo-router'],
};

function evaluateConfig({ bundleId, iosClientId, appVariant }) {
  const previousBundleId = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  const previousClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const previousAppVariant = process.env.APP_VARIANT;
  if (bundleId === undefined) delete process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  else process.env.TIMBER_IOS_BUNDLE_IDENTIFIER = bundleId;
  if (iosClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = iosClientId;
  if (appVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = appVariant;
  delete require.cache[require.resolve('./app.config')];
  const config = require('./app.config')({ config: baseConfig });
  if (previousBundleId === undefined) delete process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
  else process.env.TIMBER_IOS_BUNDLE_IDENTIFIER = previousBundleId;
  if (previousClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = previousClientId;
  if (previousAppVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = previousAppVariant;
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

assert.equal(staticConfig.android.googleServicesFile, './google-services.json');
assert.equal(
  published.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'),
  true,
  'native builds must run the expo-notifications config plugin',
);
const publishedNotifications = published.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'
);
assert.equal(publishedNotifications[1].mode, 'production');

const development = evaluateConfig({
  bundleId: undefined,
  iosClientId: IOS_CLIENT_ID,
  appVariant: 'development',
});
const developmentNotifications = development.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'
);
assert.equal(development.android.package, 'com.aquinnmo.timber_dev');
assert.equal(developmentNotifications[1].mode, 'development');
assert.deepEqual(
  googleServices.client
    .map((client) => client.client_info.android_client_info.package_name)
    .sort(),
  ['com.aquinnmo.timber', 'com.aquinnmo.timber_dev'],
  'google-services.json must initialize Firebase for development and preview/production',
);

console.log('personal iOS build configuration tests passed');
