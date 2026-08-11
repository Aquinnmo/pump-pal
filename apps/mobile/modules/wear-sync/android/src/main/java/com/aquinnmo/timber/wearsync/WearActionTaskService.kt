package com.aquinnmo.timber.wearsync

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// Runs the JS task registered in index.js as "TimberWearAction". Only reached when the
// app process is dead, so it can never race the active-workout screen's autosave.
class WearActionTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val json = intent?.getStringExtra(WearSyncModule.KEY_JSON) ?: return null
    val data = Arguments.createMap().apply { putString(WearSyncModule.KEY_JSON, json) }
    return HeadlessJsTaskConfig(
      TASK_NAME,
      data,
      TIMEOUT_MS,
      // isAllowedInForeground. This service only starts when the JS runtime is gone,
      // so it should never matter — but false makes React Native throw if the app did
      // happen to be foregrounded in the gap, and dropping the tap is worse.
      true
    )
  }

  companion object {
    private const val TASK_NAME = "TimberWearAction"
    // Cold start + auth restore + a Firestore read/write. Generous on purpose.
    private const val TIMEOUT_MS = 30_000L
  }
}
