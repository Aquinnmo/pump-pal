package com.aquinnmo.timber.liveupdate

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class LiveUpdateNotificationActionTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val json = intent?.getStringExtra(LiveUpdateNotificationModule.KEY_JSON) ?: return null
    val data = Arguments.createMap().apply { putString(LiveUpdateNotificationModule.KEY_JSON, json) }
    return HeadlessJsTaskConfig(TASK_NAME, data, TIMEOUT_MS, true)
  }

  companion object {
    private const val TASK_NAME = "TimberLiveUpdateAction"
    private const val TIMEOUT_MS = 30_000L
  }
}
