const { withAndroidManifest } = require('@expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

// Notifee's manifest ships a foreground service (shortService type) and an
// exact-alarm permission receiver. The app uses neither: workout notifications
// are plain ongoing notifications and streak reminders use inexact triggers.
// Play requires a foreground-service-type declaration for the service and
// flags exact-alarm use, so remove both from the merged manifest.
// Undo this if the app adopts notifee asForegroundService or exact alarms.
const REMOVED_COMPONENTS = [
  ['service', 'app.notifee.core.ForegroundService'],
  ['receiver', 'app.notifee.core.AlarmPermissionBroadcastReceiver'],
];

function stripNotifeeComponents(manifest) {
  manifest.manifest.$['xmlns:tools'] ??= TOOLS_NS;
  const application = manifest.manifest.application[0];

  for (const [tag, name] of REMOVED_COMPONENTS) {
    const entries = (application[tag] ??= []);
    const existing = entries.find((entry) => entry.$['android:name'] === name);
    if (existing) {
      existing.$['tools:node'] = 'remove';
    } else {
      entries.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
  }
  return manifest;
}

module.exports = function withAndroidReleaseManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    stripNotifeeComponents(modConfig.modResults);
    return modConfig;
  });
};
module.exports.stripNotifeeComponents = stripNotifeeComponents;
