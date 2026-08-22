// Dynamic config layered on top of app.json. Development builds get a distinct
// identity, while the friend-facing Apple installer supplies a stable, locally
// generated bundle identifier so a different Apple team can sign the app.
const APP_VARIANT = process.env.APP_VARIANT;
const IS_DEV = APP_VARIANT === 'development';
const LOCAL_IOS_BUNDLE_ID = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
const LOCAL_IOS_TEAM_ID = process.env.TIMBER_IOS_TEAM_ID?.trim();
if (LOCAL_IOS_TEAM_ID && !/^[A-Z0-9]{10}$/.test(LOCAL_IOS_TEAM_ID)) {
  throw new Error('TIMBER_IOS_TEAM_ID must be the 10-character Apple Team ID shown by Xcode.');
}
const { getGoogleOAuthConfig } = require('./src/config/google-oauth');

// Google sign-in lives here rather than in app.json's static plugin array
// because iosUrlScheme is the reversed iOS OAuth client ID. Personal iPhone
// builds have a generated bundle ID, so they deliberately omit the plugin:
// their configured OAuth client belongs to the published bundle ID instead.
//
// Omitted entirely when the client ID is unset: the plugin throws on a missing
// iosUrlScheme rather than skipping itself, which broke `expo export -p web` on
// Vercel, where no EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID exists. The web bundle uses
// signInWithPopup and never touches the native module, so this costs it nothing.
const { iosClientId: IOS_CLIENT_ID } = getGoogleOAuthConfig(process.env);
const googleSignInPlugin = IOS_CLIENT_ID && !LOCAL_IOS_BUNDLE_ID
  ? [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: `com.googleusercontent.apps.${IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}` },
    ]
  : null;

module.exports = ({ config }) => {
  const plugins = googleSignInPlugin ? [...(config.plugins ?? []), googleSignInPlugin] : config.plugins;
  const android = {
    ...config.android,
    googleServicesFile:
      APP_VARIANT === 'preview' || IS_DEV ? './google-services-preview.json' : './google-services.json',
    ...(IS_DEV ? { package: 'com.aquinnmo.timber_dev' } : {}),
  };
  const ios = LOCAL_IOS_TEAM_ID
    ? { ...config.ios, appleTeamId: LOCAL_IOS_TEAM_ID }
    : config.ios;

  if (!IS_DEV && !LOCAL_IOS_BUNDLE_ID) return { ...config, plugins, android, ios };

  return {
    ...config,
    plugins,
    name: IS_DEV ? 'Timber Dev' : config.name,
    android,
    ios: {
      ...ios,
      bundleIdentifier:
        LOCAL_IOS_BUNDLE_ID ||
        (IS_DEV ? 'com.aquinnmo.timber-dev' : config.ios.bundleIdentifier),
    },
  };
};
