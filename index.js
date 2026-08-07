// Custom entry point (package.json "main"). Its only job is to register the Android
// headless tasks — the home-screen widget's, and the Wear OS action handler that runs
// when a watch tap arrives with the app process dead.
// Guarded: react-native-web's AppRegistry has no registerHeadlessTask.
import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);

  // Wear OS actions no longer have a headless path: a cold process has no in-memory
  // session to apply them to (see utils/active-workout-session.ts), so there is
  // nothing left for TimberWearAction to run while the app process is dead.

  // Must match TASK_NAME in LiveUpdateNotificationActionTaskService.kt.
  const { liveUpdateNotificationActionTask } = require('./utils/live-update-notification-action-task');
  AppRegistry.registerHeadlessTask('TimberLiveUpdateAction', () => liveUpdateNotificationActionTask);
}

require('expo-router/entry');
