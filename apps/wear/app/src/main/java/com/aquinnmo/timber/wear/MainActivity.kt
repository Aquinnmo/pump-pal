package com.aquinnmo.timber.wear

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private const val TAG = "TimberWear"

// How long to wait for the phone to confirm an action before telling the user to go
// look at their phone. The phone debounces its Firestore write by 800ms, so anything
// under ~2s would cry wolf on a healthy round trip.
private const val ACK_TIMEOUT_MS = 6_000L

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {

  private val dataClient by lazy { Wearable.getDataClient(this) }
  private val messageClient by lazy { Wearable.getMessageClient(this) }
  private val capabilityClient by lazy { Wearable.getCapabilityClient(this) }

  private var state by mutableStateOf<WearState?>(null)

  // Set when an action is in flight. The watch never advances on its own: the phone
  // owns the data, so the next state push is the ack. Optimistically advancing here
  // would let the two disagree the moment a write failed.
  private var pending by mutableStateOf(false)
  private var pendingTimedOut by mutableStateOf(false)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      WearApp(
        state = state,
        pending = pending,
        pendingTimedOut = pendingTimedOut,
        onStartWorkout = { send(Actions.startWorkout()) },
        onCompleteSet = { workoutId, reps, weight -> send(Actions.completeSet(workoutId, reps, weight)) },
        onUncompleteSet = { workoutId -> send(Actions.uncompleteSet(workoutId)) },
        onFinishWorkout = { workoutId -> send(Actions.finishWorkout(workoutId)) },
      )
    }
  }

  override fun onResume() {
    super.onResume()
    dataClient.addListener(this)
    loadCurrentState()
  }

  override fun onPause() {
    super.onPause()
    dataClient.removeListener(this)
  }

  // DataItems persist on the Data Layer, so the state that was current when the watch
  // was last in range is still here — no request to the phone needed on open.
  private fun loadCurrentState() {
    lifecycleScope.launch {
      try {
        val items = dataClient.dataItems.await()
        items.firstOrNull { it.uri.path == PATH_STATE }?.let { applyItem(DataMapItem.fromDataItem(it)) }
        items.release()
      } catch (e: Exception) {
        Log.w(TAG, "initial state fetch failed", e)
      }
    }
  }

  override fun onDataChanged(events: DataEventBuffer) {
    events.forEach { event ->
      if (event.type != DataEvent.TYPE_CHANGED) return@forEach
      if (event.dataItem.uri.path != PATH_STATE) return@forEach
      applyItem(DataMapItem.fromDataItem(event.dataItem))
    }
  }

  private fun applyItem(item: DataMapItem) {
    val parsed = WearState.parse(item.dataMap.getString(KEY_JSON) ?: return) ?: return
    // Guard against out-of-order delivery undoing what the user just did.
    if (parsed.ts < (state?.ts ?: 0L)) return
    state = parsed
    pending = false
    pendingTimedOut = false
  }

  private fun send(payload: ByteArray) {
    pending = true
    pendingTimedOut = false
    val sentAtState = state?.ts ?: 0L

    lifecycleScope.launch {
      try {
        val nodes = capabilityClient.getCapability(CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE)
          .await().nodes
        val target = nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
        if (target == null) {
          pending = false
          pendingTimedOut = true
          return@launch
        }
        messageClient.sendMessage(target.id, PATH_ACTION, payload).await()

        kotlinx.coroutines.delay(ACK_TIMEOUT_MS)
        // Still nothing newer than what we had when we sent: the phone never answered.
        if (pending && (state?.ts ?: 0L) <= sentAtState) {
          pending = false
          pendingTimedOut = true
        }
      } catch (e: Exception) {
        Log.w(TAG, "send failed", e)
        pending = false
        pendingTimedOut = true
      }
    }
  }
}
