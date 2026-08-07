// Dynamic config layered on top of app.json. Development builds get a distinct
// identity, while the friend-facing Apple installer supplies a stable, locally
// generated bundle identifier so a different Apple team can sign the app.
const IS_DEV = process.env.APP_VARIANT === 'development';
const LOCAL_IOS_BUNDLE_ID = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;
const { getGoogleOAuthConfig } = require('./config/google-oauth');

// Google sign-in lives here rather than in app.json's static plugin array
// because iosUrlScheme is the reversed iOS OAuth client ID, and the iOS client
// differs per bundle identifier — which this file is what varies.
//
// Omitted entirely when the client ID is unset: the plugin throws on a missing
// iosUrlScheme rather than skipping itself, which broke `expo export -p web` on
// Vercel, where no EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID exists. The web bundle uses
// signInWithPopup and never touches the native module, so this costs it nothing.
const { iosClientId: IOS_CLIENT_ID } = getGoogleOAuthConfig(process.env);
const googleSignInPlugin = IOS_CLIENT_ID
  ? [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: `com.googleusercontent.apps.${IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}` },
    ]
  : null;

module.exports = ({ config }) => {
  const plugins = googleSignInPlugin ? [...(config.plugins ?? []), googleSignInPlugin] : config.plugins;

  if (!IS_DEV && !LOCAL_IOS_BUNDLE_ID) return { ...config, plugins };

  return {
    ...config,
    plugins,
    name: IS_DEV ? 'Timber Dev' : config.name,
    android: IS_DEV
      ? {
          ...config.android,
          package: 'com.aquinnmo.timber_dev',
        }
      : config.android,
    ios: {
      ...config.ios,
      bundleIdentifier:
        LOCAL_IOS_BUNDLE_ID ||
        (IS_DEV ? 'com.aquinnmo.timber-dev' : config.ios.bundleIdentifier),
    },
  };
};
