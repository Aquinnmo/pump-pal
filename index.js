// Custom entry point (package.json "main"). Its only job is to register the Android
// headless tasks — the home-screen widget's, and the Wear OS action handler that runs
// when a watch tap arrives with the app process dead.
// Guarded: react-native-web's AppRegistry has no registerHeadlessTask.
import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);

  // Must match TASK_NAME in modules/wear-sync/.../WearActionTaskService.kt.
  const { wearActionTask } = require('./utils/wear-action-task');
  AppRegistry.registerHeadlessTask('TimberWearAction', () => wearActionTask);

  // Must match TASK_NAME in LiveUpdateNotificationActionTaskService.kt.
  const { liveUpdateNotificationActionTask } = require('./utils/live-update-notification-action-task');
  AppRegistry.registerHeadlessTask('TimberLiveUpdateAction', () => liveUpdateNotificationActionTask);
}

require('expo-router/entry');
