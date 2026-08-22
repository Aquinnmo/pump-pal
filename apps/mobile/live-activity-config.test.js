const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = __dirname;
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const ios = appJson.expo.ios;
const appGroups = ios.entitlements['com.apple.security.application-groups'];
const widgetRoot = path.join(mobileRoot, 'targets', 'widget');
const widgetConfig = require(path.join(widgetRoot, 'expo-target.config.js'))({ ios });

assert.equal(ios.infoPlist.NSSupportsLiveActivities, true);
assert.deepEqual(appGroups, ['group.com.aquinnmo.timber.liveactivity']);
assert.match(mobilePackage.scripts['dev:ios'] ?? mobilePackage.scripts['dev:apple'], /APP_VARIANT=development/);
assert.match(mobilePackage.scripts['install:ios'] ?? mobilePackage.scripts['install:apple'], /expo run:ios --device/);

const buildProperties = appJson.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
);
assert.ok(buildProperties, 'expo-build-properties must configure the Apple build');
assert.equal(buildProperties[1].ios.deploymentTarget, undefined);

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
assert.match(moduleSwift, /#available\(iOS 17\.0, \*\)/);
assert.doesNotMatch(moduleSwift, /#available\(iOS 16\.1, \*\)/);
assert.match(moduleSwift, /Task \{ @MainActor/);
assert.match(moduleSwift, /clearPendingAction\(\)/);
assert.match(moduleSwift, /activityGeneration/);
assert.match(moduleSwift, /isCurrentActivityOperation\(generation\)/);

const iosNotification = fs.readFileSync(
  path.join(mobileRoot, 'src', 'lib', 'workout-notification.ios.ts'),
  'utf8',
);
assert.match(iosNotification, /isNativeModuleAvailable\(\)/);
assert.match(iosNotification, /console\.warn/);
assert.match(iosNotification, /Rebuild the iOS development client/);
assert.match(iosNotification, /Live Activities are unavailable/);
assert.match(iosNotification, /no iOS notification fallback is provided/);

// The intents run in the app's process (LiveActivityIntent, iOS 17+) — that wrong
// "own process" claim is what the missing app-target membership followed from, and
// each guard rejection must log so a device run can tell "never ran" from "ran and
// rejected" (pump-pal-l4d8).
const intentsSwift = fs.readFileSync(path.join(widgetRoot, 'WorkoutLiveActivityIntents.swift'), 'utf8');
assert.match(intentsSwift, /stored\.workoutId == workoutId/);
assert.match(intentsSwift, /stored\.completedSets == expectedCompletedSets/);
assert.doesNotMatch(intentsSwift, /activity\.update/);
assert.doesNotMatch(intentsSwift, /activity\.end/);
assert.match(intentsSwift, /runs in the host APP's process/);
assert.doesNotMatch(intentsSwift, /Live Activity's own process/);
assert.equal((intentsSwift.match(/NSLog\(/g) ?? []).length >= 6, true);

// The config plugin gives the app target its own membership of the intents file —
// without it LiveActivityIntent taps resolve to nothing (pump-pal-ks2l).
const intentsPluginPath = path.join(mobileRoot, 'plugins', 'with-live-activity-intents.js');
assert.ok(fs.existsSync(intentsPluginPath), 'with-live-activity-intents.js plugin must exist');
const intentsPlugin = fs.readFileSync(intentsPluginPath, 'utf8');
assert.match(intentsPlugin, /WorkoutLiveActivityIntents\.swift/);
assert.match(intentsPlugin, /platformProjectRoot/);
assert.match(intentsPlugin, /'Timber'/);

const pluginList = appJson.expo.plugins;
const intentsPluginIndex = pluginList.indexOf('./plugins/with-live-activity-intents');
const appleTargetsIndex = pluginList.indexOf('@bacons/apple-targets');
assert.ok(intentsPluginIndex !== -1, 'app.json must register ./plugins/with-live-activity-intents');
assert.ok(
  intentsPluginIndex > appleTargetsIndex,
  'with-live-activity-intents must be registered after @bacons/apple-targets',
);

const widgetSwift = fs.readFileSync(path.join(widgetRoot, 'WorkoutLiveActivity.swift'), 'utf8');
assert.match(widgetSwift, /GeometryReader/);
assert.match(widgetSwift, /availableWidth \* CGFloat\(max\(segment\.sets, 0\)\)/);
assert.match(widgetSwift, /\.accessibilityLabel\("Workout exercise progress"\)/);
assert.match(widgetSwift, /0x66 \/ 255/);
assert.match(widgetSwift, /\.frame\(maxWidth: \.infinity, alignment: \.leading\)/);
assert.match(widgetSwift, /\.layoutPriority\(1\)/);
assert.match(widgetSwift, /\.contentMargins\(\.horizontal, 4\)/);
assert.match(widgetSwift, /\.minimumScaleFactor\(0\.8\)/);
assert.match(widgetSwift, /longCopyPreviewState/);

// Tracker pip — the one element that makes Android's Notification.ProgressStyle
// recognizable, and the layout's one spend of boldness.
assert.match(widgetSwift, /Capsule\(\)/);
assert.match(widgetSwift, /trackerX/);
assert.match(widgetSwift, /\.frame\(width: 10, height: 10\)/);

// Action chips: r14, plain button style, and the three arrangements the domain
// model emits (workout-notification-model.ts:96-104).
assert.match(widgetSwift, /cornerRadius: 14/);
assert.match(widgetSwift, /\.buttonStyle\(\.plain\)/);
assert.match(widgetSwift, /actions == \["completeSet"\]/);
assert.match(widgetSwift, /actions == \["completeSet", "uncompleteSet"\]/);
assert.match(widgetSwift, /actions == \["finishWorkout", "uncompleteSet"\]/);

// Minimal-presentation ring, not clipped text — permitted because sets have a real
// target (totalSets), per docs/design-language.md's rule against rings on
// unbounded metrics.
assert.match(widgetSwift, /\.trim\(from: 0, to: progress\)/);

assert.equal((widgetSwift.match(/#Preview\(/g) ?? []).length >= 11, true);
assert.doesNotMatch(
  widgetSwift,
  /using:\s*\.(?:preview|longTitlePreview)/,
  'ActivityKit preview macros need an explicit WorkoutActivityAttributes value for generic inference',
);
assert.equal(
  (widgetSwift.match(/using:\s*WorkoutActivityAttributes\.(?:preview|longTitlePreview)/g) ?? []).length,
  11,
);

const actionBridge = fs.readFileSync(
  path.join(mobileRoot, 'src', 'lib', 'live-update-notification-actions.ios.ts'),
  'utf8',
);
assert.match(actionBridge, /type ActionOwner = 'root' \| 'active-workout'/);
assert.match(actionBridge, /deliveredOwners/);
assert.match(actionBridge, /releasePendingAction/);
assert.match(actionBridge, /setTimeout\(releasePendingAction, 10_000\)/);

const localPreview = fs.readFileSync(path.join(mobileRoot, '..', '..', 'IOS_LOCAL_PREVIEW.md'), 'utf8');
assert.match(localPreview, /queued action is rejected and cleared/);
assert.doesNotMatch(localPreview, /pending action is delivered once to the in-memory session/);
assert.match(localPreview, /backgrounded but alive/);
assert.match(localPreview, /background-launch/);

console.log('iOS Live Activity target contract tests passed');
