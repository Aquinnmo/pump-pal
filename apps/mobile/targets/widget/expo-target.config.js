// @bacons/apple-targets config for the Live Activity widget extension.
// Set expo.ios.appleTeamId in app.json before running prebuild (found in Xcode's
// Signing & Capabilities tab) — this plugin doesn't take it as a config option.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TimberWidget',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['ActivityKit', 'AppIntents', 'SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
