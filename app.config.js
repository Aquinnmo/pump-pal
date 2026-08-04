// Dynamic config layered on top of app.json. Development builds get a distinct
// identity, while the friend-facing Apple installer supplies a stable, locally
// generated bundle identifier so a different Apple team can sign the app.
const IS_DEV = process.env.APP_VARIANT === 'development';
const LOCAL_IOS_BUNDLE_ID = process.env.TIMBER_IOS_BUNDLE_IDENTIFIER;

module.exports = ({ config }) => {
  if (!IS_DEV && !LOCAL_IOS_BUNDLE_ID) return config;

  return {
    ...config,
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
