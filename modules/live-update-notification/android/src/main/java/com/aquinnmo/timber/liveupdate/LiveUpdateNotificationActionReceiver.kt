package com.aquinnmo.timber.liveupdate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONObject

private const val TAG = "LiveUpdateNotification"

// The receiver transports a validated intent only. Workout reads/writes stay in JS,
// where notification controls and Wear controls share the same domain rules.
class LiveUpdateNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val workoutId = intent.getStringExtra(LiveUpdateNotificationModule.KEY_WORKOUT_ID)
    val action = intent.getStringExtra(LiveUpdateNotificationModule.KEY_ACTION)
    val expectedCompletedSets = intent.getIntExtra(LiveUpdateNotificationModule.KEY_EXPECTED_COMPLETED_SETS, -1)
    if (
      workoutId.isNullOrBlank() ||
      expectedCompletedSets < 0 ||
      action !in LiveUpdateNotificationModule.KNOWN_ACTIONS
    ) return

    val json = JSONObject()
      .put("action", action)
      .put("workoutId", workoutId)
      .put("expectedCompletedSets", expectedCompletedSets)
      .toString()
    val module = LiveUpdateNotificationModule.instance
    if (module != null) {
      module.emitAction(json)
      return
    }

    try {
      HeadlessJsTaskService.acquireWakeLockNow(context)
      context.startService(
        Intent(context, LiveUpdateNotificationActionTaskService::class.java)
          .putExtra(LiveUpdateNotificationModule.KEY_JSON, json)
      )
    } catch (e: IllegalStateException) {
      // A refused background start must never imply a set was logged.
      Log.w(TAG, "background start refused; notification action dropped", e)
    }
  }
}
