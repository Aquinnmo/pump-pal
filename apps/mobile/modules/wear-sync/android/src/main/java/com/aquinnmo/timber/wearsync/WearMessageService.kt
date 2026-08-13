package com.aquinnmo.timber.wearsync

import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

private const val TAG = "WearSync"

// Every watch action lands here. Two delivery paths, because the watch can be tapped
// whether or not the phone app is running:
//   app alive  -> emit a JS event; the active-workout screen owns the draft state.
//   app killed -> headless JS task updates only the phone's in-memory session.
class WearMessageService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != WearSyncModule.PATH_ACTION) return
    val json = String(event.data, Charsets.UTF_8)

    val module = WearSyncModule.instance
    if (module != null) {
      module.emitAction(json)
      return
    }

    try {
      HeadlessJsTaskService.acquireWakeLockNow(this)
      startService(Intent(this, WearActionTaskService::class.java).putExtra(WearSyncModule.KEY_JSON, json))
    } catch (e: IllegalStateException) {
      // Android bars background service starts in some states. Dropping the action is
      // safe: the watch never advances on its own, so it times out and tells the user
      // to open their phone rather than silently disagreeing with the real data.
      // ponytail: drop-on-denial. If this proves common, post a tap-to-open
      // notification deep-linking pumppal://up-next instead.
      Log.w(TAG, "background start refused, action dropped", e)
    }
  }
}
