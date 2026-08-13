package com.aquinnmo.timber.wearsync

import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "WearSync"

// Phone half of the Wear OS bridge. The phone is the only Firestore writer: it pushes
// display state to the watch as a DataItem, and the watch posts actions back as
// messages (received by WearMessageService).
class WearSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearSync")

    Events(EVENT_ACTION)

    // JS state pre-serialized in utils/wear-sync.android.ts. DataItems persist on the
    // Data Layer, so a watch that was off or out of range gets the latest state as
    // soon as it reconnects — no request/response needed.
    Function("pushState") { json: String ->
      val context = appContext.reactContext ?: return@Function false
      val request = PutDataMapRequest.create(PATH_STATE).apply {
        dataMap.putString(KEY_JSON, json)
      }.asPutDataRequest().setUrgent()
      Wearable.getDataClient(context).putDataItem(request)
        .addOnFailureListener { Log.w(TAG, "pushState failed", it) }
      true
    }

    // Set while the JS runtime is alive and this module is loaded. WearMessageService
    // reads it to decide between delivering an event to the running app and spinning
    // up the headless task.
    OnCreate { instance = this@WearSyncModule }
    OnDestroy { if (instance === this@WearSyncModule) instance = null }
  }

  fun emitAction(json: String) {
    sendEvent(EVENT_ACTION, mapOf("json" to json))
  }

  companion object {
    const val PATH_STATE = "/timber/state"
    const val PATH_ACTION = "/timber/action"
    const val KEY_JSON = "json"
    const val EVENT_ACTION = "onWearAction"

    @Volatile
    var instance: WearSyncModule? = null
  }
}
