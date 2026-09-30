/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = __dirname;
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const { stripNotifeeComponents } = require('./plugins/with-android-release-manifest');

assert.deepEqual([...appJson.expo.android.blockedPermissions].sort(), [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

const plugins = appJson.expo.plugins;
assert.equal(
  plugins[plugins.indexOf('./plugins/with-notifee-maven') + 1],
  './plugins/with-android-release-manifest',
  'the release-manifest plugin must be registered right after with-notifee-maven',
);

const manifest = { manifest: { $: {}, application: [{ $: {} }] } };
stripNotifeeComponents(manifest);
stripNotifeeComponents(manifest); // idempotent

const application = manifest.manifest.application[0];
assert.ok(manifest.manifest.$['xmlns:tools']);
assert.deepEqual(application.service, [
  { $: { 'android:name': 'app.notifee.core.ForegroundService', 'tools:node': 'remove' } },
]);
assert.deepEqual(application.receiver, [
  { $: { 'android:name': 'app.notifee.core.AlarmPermissionBroadcastReceiver', 'tools:node': 'remove' } },
]);

console.log('android release manifest checks passed');
