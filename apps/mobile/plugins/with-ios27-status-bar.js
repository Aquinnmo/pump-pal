const { withPodfile } = require('@expo/config-plugins');

const hook = "    require_relative '../plugins/patch-firebase-crashlytics-status-bar'\n    patch_firebase_crashlytics_status_bar(installer.sandbox.root)\n";

module.exports = function withIos27StatusBar(config) {
  return withPodfile(config, (modConfig) => {
    if (modConfig.modResults.contents.includes(hook)) return modConfig;
    const anchor = '  post_install do |installer|\n';
    if (!modConfig.modResults.contents.includes(anchor)) throw new Error('iOS Podfile post_install hook missing');
    modConfig.modResults.contents = modConfig.modResults.contents.replace(anchor, anchor + hook);
    return modConfig;
  });
};
