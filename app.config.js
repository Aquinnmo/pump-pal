// Dynamic config layered on top of app.json. Development builds get a distinct
// identity, while the friend-facing Apple installer supplies a stable, locally
// generated bundle identifier so a different Apple team can sign the app.
const IS_DEV = process.env.APP_VARIANT === 'development';
const LOCAL_IOS_BUNDLE_ID = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;

// Google sign-in lives here rather than in app.json's static plugin array
// because iosUrlScheme is the reversed iOS OAuth client ID, and the iOS client
// differs per bundle identifier — which this file is what varies.
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleSignInPlugin = [
  '@react-native-google-signin/google-signin',
  IOS_CLIENT_ID
    ? { iosUrlScheme: `com.googleusercontent.apps.${IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}` }
    : {},
];

module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? []), googleSignInPlugin];

  if (!IS_DEV && !LOCAL_IOS_BUNDLE_ID) return { ...config, plugins };

  return {
    ...config,
    plugins,
    name: IS_DEV ? 'Timber Dev' : config.name,
    android: IS_DEV
      ? {
          ...config.android,
          package: 'com.aquinnmo.timber.dev',
        }
      : config.android,
    ios: {
      ...config.ios,
      bundleIdentifier:
        LOCAL_IOS_BUNDLE_ID ||
        (IS_DEV ? 'com.aquinnmo.timber.dev' : config.ios.bundleIdentifier),
    },
  };
};
