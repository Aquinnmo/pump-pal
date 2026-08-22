// @bacons/apple-targets config for the Live Activity widget extension.
// The plugin reads ios.appleTeamId from the evaluated Expo config. app.config.js
// accepts TIMBER_IOS_TEAM_ID as an optional, validated override; never invent one.
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
