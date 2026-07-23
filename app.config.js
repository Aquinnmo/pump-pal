// Dynamic config layered on top of app.json. Its only job: give the dev-client
// build a distinct app name + Android package so it installs ALONGSIDE the
// existing "Timber" preview/production app instead of replacing it.
// Triggered by APP_VARIANT=development (set in eas.json's development profile,
// or inline for a local `expo run:android`).
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) return config; // preview/production unchanged

  return {
    ...config,
    name: 'Timber Dev',
    android: {
      ...config.android,
      package: 'com.aquinnmo.timber.dev',
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.aquinnmo.timber.dev',
    },
  };
};
