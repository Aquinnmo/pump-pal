/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = __dirname;
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const firebaseJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'firebase.json'), 'utf8'));
const ios = appJson.expo.ios;
const appGroups = ios.entitlements['com.apple.security.application-groups'];
const widgetRoot = path.join(mobileRoot, 'targets', 'widget');
const widgetConfig = require(path.join(widgetRoot, 'expo-target.config.js'))({ ios });

assert.equal(ios.infoPlist.NSSupportsLiveActivities, true);
assert.equal(ios.infoPlist.NSSupportsLiveActivitiesFrequentUpdates, true);
assert.deepEqual(appGroups, ['group.com.aquinnmo.timber.lkpt5wjq99.liveactivity']);
assert.equal(
  ios.entitlements['com.apple.developer.devicecheck.appattest-environment'],
  'development',
  'the host app must opt into App Attest; TestFlight uses its production environment automatically',
);
assert.equal(mobilePackage.dependencies['@react-native-firebase/crashlytics'], '26.2.0');
assert.ok(
  appJson.expo.plugins.includes('@react-native-firebase/crashlytics'),
  'app.json must register the Crashlytics config plugin',
);
assert.deepEqual(firebaseJson['react-native'], {
  crashlytics_auto_collection_enabled: true,
  crashlytics_debug_enabled: false,
  crashlytics_javascript_exception_handler_chaining_enabled: false,
});
assert.match(mobilePackage.scripts['dev:ios'] ?? mobilePackage.scripts['dev:apple'], /APP_VARIANT=development/);
assert.match(mobilePackage.scripts['install:ios'] ?? mobilePackage.scripts['install:apple'], /expo run:ios --device/);

const buildProperties = appJson.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
);
assert.ok(buildProperties, 'expo-build-properties must configure the Apple build');
assert.equal(buildProperties[1].ios.deploymentTarget, undefined);
assert.equal(
  buildProperties[1].ios.enableSceneSupport,
  true,
  'Xcode 27 builds must use the UIKit scene lifecycle required by iOS 27',
);

assert.equal(widgetConfig.type, 'widget');
assert.equal(widgetConfig.deploymentTarget, '17.0');
assert.deepEqual(widgetConfig.entitlements['com.apple.security.application-groups'], appGroups);
assert.deepEqual(
  widgetConfig.frameworks,
  ['ActivityKit', 'AppIntents', 'SwiftUI', 'WidgetKit'],
);

const widgetInfo = fs.readFileSync(path.join(widgetRoot, 'Info.plist'), 'utf8');
assert.match(widgetInfo, /<key>NSSupportsLiveActivities<\/key>\s*<true\s*\/>/);
assert.match(widgetInfo, /<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.widgetkit-extension<\/string>/);

const moduleAttributes = fs.readFileSync(
  path.join(mobileRoot, 'modules', 'live-update-notification', 'ios', 'WorkoutActivityAttributes.swift'),
  'utf8',
);
const widgetAttributes = fs.readFileSync(path.join(widgetRoot, 'WorkoutActivityAttributes.swift'), 'utf8');
assert.equal(widgetAttributes, moduleAttributes, 'host and widget ActivityAttributes must stay synchronized');

const moduleSwift = fs.readFileSync(
  path.join(mobileRoot, 'modules', 'live-update-notification', 'ios', 'LiveUpdateNotificationModule.swift'),
  'utf8',
);
const moduleStore = fs.readFileSync(
  path.join(mobileRoot, 'modules', 'live-update-notification', 'ios', 'LiveUpdateSharedStore.swift'),
  'utf8',
);
const widgetStore = fs.readFileSync(path.join(widgetRoot, 'LiveUpdateSharedStore.swift'), 'utf8');
assert.equal(moduleStore.match(/public static let appGroupId = "([^"]+)"/)?.[1], appGroups[0]);
assert.equal(widgetStore.match(/public static let appGroupId = "([^"]+)"/)?.[1], appGroups[0]);
// Wiring and cross-target contracts; behavior is covered by JS and Swift checks.
assert.equal(widgetStore, moduleStore, 'host and widget must use the same durable store');
assert.match(moduleSwift, /AsyncFunction\("showAsync"\)/);
assert.match(moduleSwift, /AsyncFunction\("dismissAsync"\)/);
assert.match(moduleSwift, /Function\("readJournal"\)/);
assert.match(moduleSwift, /AsyncFunction\("acknowledgeJournal"\)/);
assert.match(moduleSwift, /case \.deferred: return true/, 'the app must not overwrite unreplayed native taps');
assert.match(moduleStore, /NSFileCoordinator/);
assert.match(moduleStore, /options: \.atomic/);
assert.match(moduleAttributes, /public var title: String\?/);

const intentsSwift = fs.readFileSync(path.join(widgetRoot, 'WorkoutLiveActivityIntents.swift'), 'utf8');
// The widget extension cannot see Live Activities, so every intent must run in
// the app process. None of them waits on JS to update the activity.
assert.equal((intentsSwift.match(/: AppIntent \{/g) ?? []).length, 0);
assert.equal((intentsSwift.match(/: LiveActivityIntent \{/g) ?? []).length, 3);
assert.match(intentsSwift, /LiveUpdateSharedStore\.commit\(action/);
assert.match(intentsSwift, /LiveUpdateSharedStore\.publishLatest\(workoutId:/);
assert.doesNotMatch(intentsSwift, /enqueue|result\(for:|WorkoutIntentError/);
assert.match(intentsSwift, /internal import LiveUpdateNotification/);
assert.match(intentsSwift, /initializeReactHost\(launchOptions:/);
assert.doesNotMatch(intentsSwift, /startReactNative\(|makeKeyAndVisible\(/);
const entry = fs.readFileSync(path.join(mobileRoot, 'index.js'), 'utf8');
assert.ok(entry.indexOf("require('./src/lib/live-activity-runtime.ios')") < entry.indexOf("require('expo-router/entry')"));

const pluginList = appJson.expo.plugins;
assert.ok(pluginList.indexOf('./plugins/with-live-activity-intents') > pluginList.indexOf('@bacons/apple-targets'));
const plugin = fs.readFileSync(path.join(mobileRoot, 'plugins', 'with-live-activity-intents.js'), 'utf8');
assert.match(plugin, /WorkoutLiveActivityIntents\.swift/);
assert.match(plugin, /platformProjectRoot/);
assert.match(mobilePackage.scripts['dev:ios'], /APP_VARIANT=development bunx expo prebuild --clean --platform ios && APP_VARIANT=development bunx expo run:ios/,
  'dev:ios must refresh generated intent sources before compiling an existing native project');

const widget = fs.readFileSync(path.join(widgetRoot, 'WorkoutLiveActivity.swift'), 'utf8');
assert.doesNotMatch(widget, /GeometryReader\s*\{|let barWidth: CGFloat = 320/);
assert.match(widget, /func path\(in rect: CGRect\)/);
assert.match(widget, /\.frame\(minHeight: 44\)/);
assert.match(widget, /Toggle\(isOn: false, intent: intent\)/, 'actions must redraw instantly while iOS wakes the app');
assert.doesNotMatch(widget, /\.invalidatableContent\(|redactionReasons/, 'neither pending effect is visible or on-brand');
assert.match(widget, /timerInterval:/);
assert.match(widget, /compactLeading:/);
assert.match(widget, /compactTrailing:/);
assert.match(widget, /minimal:/);
assert.match(widget, /context\.state\.title \?\? context\.attributes\.title/);
console.log('iOS Live Activity target contract tests passed');
