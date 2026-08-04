const { withProjectBuildGradle } = require('@expo/config-plugins');

const NOTIFEE_REPOSITORY = 'notifee/react-native/android/libs';

/**
 * Notifee 9 bundles app.notifee:core in its local Android Maven repository.
 * Expo/RN autolinking adds the module, but this repository is not consistently
 * applied to the generated app project, so make it explicit at the root.
 */
module.exports = function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('with-notifee-maven requires a Groovy Android build.gradle');
    }

    if (modConfig.modResults.contents.includes(NOTIFEE_REPOSITORY)) {
      return modConfig;
    }

    modConfig.modResults.contents += `\n\nallprojects {\n  repositories {\n    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }\n  }\n}\n`;
    return modConfig;
  });
};
