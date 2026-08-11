package com.aquinnmo.timber.wear

import org.json.JSONObject

// Mirror of utils/wear-state.ts on the phone. Kept hand-rolled with org.json rather
// than pulling in a serialization library: it is four fields and a discriminator.

const val PATH_STATE = "/timber/state"
const val PATH_ACTION = "/timber/action"
const val KEY_JSON = "json"

// Must match modules/wear-sync/android/src/main/res/values/wear.xml.
const val CAPABILITY_PHONE = "timber_phone"

data class IdleState(
  val label: String,
  val name: String,
  val action: String,
)

data class ActiveState(
  val workoutId: String,
  val workoutName: String,
  val exercise: String,
  val setNumber: Int,
  val setsInExercise: Int,
  val reps: Int,
  val weight: Double,
  val bodyweight: Boolean,
  // Non-null marks a timed set: reps and weight are meaningless, so the dial is off.
  val durationSeconds: Int?,
  val completedSets: Int,
  val totalSets: Int,
)

enum class Mode { IDLE, ACTIVE, EMPTY, DONE }

data class WearState(
  val ts: Long,
  val mode: Mode,
  val idle: IdleState?,
  val active: ActiveState?,
) {
  companion object {
    fun parse(json: String): WearState? = try {
      val root = JSONObject(json)
      val mode = when (root.optString("mode")) {
        "idle" -> Mode.IDLE
        "active" -> Mode.ACTIVE
        "empty" -> Mode.EMPTY
        "done" -> Mode.DONE
        else -> return null
      }
      WearState(
        ts = root.optLong("ts"),
        mode = mode,
        idle = root.optJSONObject("idle")?.let {
          IdleState(
            label = it.optString("label"),
            name = it.optString("name"),
            action = it.optString("action"),
          )
        },
        active = root.optJSONObject("active")?.let {
          ActiveState(
            workoutId = it.optString("workoutId"),
            workoutName = it.optString("workoutName"),
            exercise = it.optString("exercise"),
            setNumber = it.optInt("setNumber"),
            setsInExercise = it.optInt("setsInExercise"),
            reps = it.optInt("reps"),
            weight = it.optDouble("weight", 0.0),
            bodyweight = it.optBoolean("bodyweight"),
            durationSeconds = if (it.isNull("durationSeconds")) null else it.optInt("durationSeconds"),
            completedSets = it.optInt("completedSets"),
            totalSets = it.optInt("totalSets"),
          )
        },
      )
    } catch (e: Exception) {
      null
    }
  }
}

object Actions {
  fun startWorkout(): ByteArray = JSONObject()
    .put("action", "startWorkout")
    .toString().toByteArray()

  // reps/weight carry whatever the dial was left on, so the phone records what was
  // actually lifted rather than what was planned.
  fun completeSet(workoutId: String, reps: Int?, weight: Double?): ByteArray = JSONObject()
    .put("action", "completeSet")
    .put("workoutId", workoutId)
    .apply {
      reps?.let { put("reps", it) }
      weight?.let { put("weight", it) }
    }
    .toString().toByteArray()

  fun uncompleteSet(workoutId: String): ByteArray = JSONObject()
    .put("action", "uncompleteSet")
    .put("workoutId", workoutId)
    .toString().toByteArray()

  fun finishWorkout(workoutId: String): ByteArray = JSONObject()
    .put("action", "finishWorkout")
    .put("workoutId", workoutId)
    .toString().toByteArray()
}
