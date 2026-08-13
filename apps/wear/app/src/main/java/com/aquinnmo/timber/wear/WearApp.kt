package com.aquinnmo.timber.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlin.math.abs
import kotlin.math.roundToInt

// Matches the phone app and the home-screen widget.
private val BACKGROUND = Color(0xFF0F0F0F)
private val SURFACE = Color(0xFF1A1818)
private val ACCENT = Color(0xFFE54242)
private val MUTED = Color(0xFF9A9A9A)

// Rotary hardware is not uniform: a crown, a bezel and an emulator's scroll wheel all
// report different magnitudes per detent. Raise this if the dial feels twitchy on a
// real watch, lower it if it feels sticky.
private const val ROTARY_PIXELS_PER_STEP = 45f
private const val WEIGHT_STEP = 2.5

private enum class Field { REPS, WEIGHT }

@Composable
fun WearApp(
  state: WearState?,
  pending: Boolean,
  pendingTimedOut: Boolean,
  onStartWorkout: () -> Unit,
  onCompleteSet: (workoutId: String, reps: Int?, weight: Double?) -> Unit,
  onUncompleteSet: (workoutId: String) -> Unit,
  onFinishWorkout: (workoutId: String) -> Unit,
) {
  MaterialTheme {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .background(BACKGROUND),
      contentAlignment = Alignment.Center,
    ) {
      Column(
        modifier = Modifier
          .fillMaxSize()
          .verticalScroll(rememberScrollState())
          .padding(horizontal = 16.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
      ) {
        when (state?.mode) {
          null -> Message("Open Timber on your phone")
          Mode.IDLE -> IdleScreen(state.idle, pending, onStartWorkout)
          Mode.EMPTY -> Message("Add exercises on your phone to start logging sets")
          Mode.DONE -> DoneScreen(state.active, pending, onUncompleteSet, onFinishWorkout)
          Mode.ACTIVE -> ActiveScreen(state, pending, onCompleteSet, onUncompleteSet)
        }

        if (pendingTimedOut) {
          Spacer(Modifier.height(8.dp))
          Text(
            text = "No answer — check your phone",
            style = MaterialTheme.typography.caption2,
            color = ACCENT,
            textAlign = TextAlign.Center,
          )
        }
      }
    }
  }
}

@Composable
private fun Message(text: String) {
  Text(
    text = text,
    style = MaterialTheme.typography.body2,
    color = MUTED,
    textAlign = TextAlign.Center,
  )
}

@Composable
private fun IdleScreen(idle: IdleState?, pending: Boolean, onStart: () -> Unit) {
  Text(
    text = idle?.label ?: "Up next",
    style = MaterialTheme.typography.caption1,
    color = MUTED,
  )
  Text(
    text = idle?.name ?: "Start a workout",
    style = MaterialTheme.typography.title2,
    color = Color.White,
    textAlign = TextAlign.Center,
  )
  Spacer(Modifier.height(12.dp))
  Chip(
    onClick = onStart,
    enabled = !pending,
    colors = ChipDefaults.primaryChipColors(backgroundColor = ACCENT),
    label = {
      if (pending) Spinner() else Text(idle?.action ?: "Start workout", textAlign = TextAlign.Center)
    },
    modifier = Modifier.fillMaxWidth(),
  )
}

@Composable
private fun DoneScreen(
  active: ActiveState?,
  pending: Boolean,
  onUncompleteSet: (String) -> Unit,
  onFinishWorkout: (String) -> Unit,
) {
  val workoutId = active?.workoutId
  Text(
    text = "All sets done",
    style = MaterialTheme.typography.title3,
    color = Color.White,
    textAlign = TextAlign.Center,
  )
  active?.let {
    Text(
      text = "${it.completedSets} of ${it.totalSets} sets",
      style = MaterialTheme.typography.caption1,
      color = MUTED,
    )
  }
  Spacer(Modifier.height(12.dp))
  Chip(
    onClick = { workoutId?.let(onFinishWorkout) },
    enabled = !pending && workoutId != null,
    colors = ChipDefaults.primaryChipColors(backgroundColor = ACCENT),
    label = { if (pending) Spinner() else Text("Finish workout") },
    modifier = Modifier.fillMaxWidth(),
  )
  Spacer(Modifier.height(8.dp))
  UndoButton(enabled = !pending && workoutId != null) { workoutId?.let(onUncompleteSet) }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun ActiveScreen(
  state: WearState,
  pending: Boolean,
  onCompleteSet: (workoutId: String, reps: Int?, weight: Double?) -> Unit,
  onUncompleteSet: (workoutId: String) -> Unit,
) {
  val active = state.active ?: return Message("Waiting for your phone")
  val timed = active.durationSeconds != null

  // Re-keyed on the push timestamp: the phone is the source of truth, so every state
  // it sends discards whatever the dial was left on.
  var reps by remember(state.ts) { mutableIntStateOf(active.reps) }
  var weight by remember(state.ts) { mutableStateOf(active.weight) }
  var field by remember(state.ts) { mutableStateOf(if (active.bodyweight) Field.REPS else Field.WEIGHT) }
  var accumulated by remember(state.ts) { mutableFloatStateOf(0f) }

  val haptics = LocalHapticFeedback.current
  val focusRequester = remember { FocusRequester() }
  LaunchedEffect(Unit) { focusRequester.requestFocus() }

  Text(
    text = active.exercise.ifBlank { active.workoutName },
    style = MaterialTheme.typography.title3,
    color = Color.White,
    textAlign = TextAlign.Center,
  )
  Text(
    text = "Set ${active.setNumber} of ${active.setsInExercise}",
    style = MaterialTheme.typography.caption1,
    color = MUTED,
  )
  Spacer(Modifier.height(10.dp))

  if (timed) {
    Text(
      text = formatDuration(active.durationSeconds!!),
      style = MaterialTheme.typography.display3,
      color = Color.White,
    )
  } else {
    Row(
      horizontalArrangement = Arrangement.Center,
      verticalAlignment = Alignment.CenterVertically,
      modifier = Modifier
        // The dial edits whichever value is selected. Nothing here is typed: a tap
        // switches fields, the crown changes the number.
        .onRotaryScrollEvent { event ->
          accumulated += event.verticalScrollPixels
          val steps = (accumulated / ROTARY_PIXELS_PER_STEP).toInt()
          if (steps != 0) {
            accumulated -= steps * ROTARY_PIXELS_PER_STEP
            if (field == Field.REPS) {
              reps = (reps + steps).coerceAtLeast(0)
            } else {
              weight = (weight + steps * WEIGHT_STEP).coerceAtLeast(0.0)
            }
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
          }
          true
        }
        .focusRequester(focusRequester)
        .focusable(),
    ) {
      ValueChip(
        value = reps.toString(),
        unit = "reps",
        selected = field == Field.REPS,
        onClick = { field = Field.REPS },
      )
      if (!active.bodyweight) {
        Spacer(Modifier.width(6.dp))
        ValueChip(
          value = formatWeight(weight),
          unit = "lb",
          selected = field == Field.WEIGHT,
          onClick = { field = Field.WEIGHT },
        )
      }
    }
  }

  Spacer(Modifier.height(10.dp))
  Chip(
    onClick = {
      onCompleteSet(
        active.workoutId,
        if (timed) null else reps,
        if (timed || active.bodyweight) null else weight,
      )
    },
    enabled = !pending,
    colors = ChipDefaults.primaryChipColors(backgroundColor = ACCENT),
    label = { if (pending) Spinner() else Text("Complete set") },
    modifier = Modifier.fillMaxWidth(),
  )

  Spacer(Modifier.height(8.dp))
  Row(verticalAlignment = Alignment.CenterVertically) {
    UndoButton(enabled = !pending && active.completedSets > 0) { onUncompleteSet(active.workoutId) }
    Spacer(Modifier.width(8.dp))
    Text(
      text = "${active.completedSets}/${active.totalSets}",
      style = MaterialTheme.typography.caption2,
      color = MUTED,
    )
  }
}

@Composable
private fun ValueChip(value: String, unit: String, selected: Boolean, onClick: () -> Unit) {
  Chip(
    onClick = onClick,
    colors = ChipDefaults.secondaryChipColors(
      backgroundColor = if (selected) SURFACE else Color.Transparent,
    ),
    border = ChipDefaults.chipBorder(),
    label = {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = value,
          style = MaterialTheme.typography.title2,
          color = if (selected) Color.White else MUTED,
          fontWeight = FontWeight.Bold,
        )
        Text(text = unit, style = MaterialTheme.typography.caption3, color = MUTED)
      }
    },
  )
}

// Deliberately small: undoing is the rare correction, completing is the common act.
@Composable
private fun UndoButton(enabled: Boolean, onClick: () -> Unit) {
  CompactChip(
    onClick = onClick,
    enabled = enabled,
    colors = ChipDefaults.secondaryChipColors(backgroundColor = SURFACE),
    label = { Text("Undo last set", style = MaterialTheme.typography.caption2) },
  )
}

@Composable
private fun Spinner() {
  CircularProgressIndicator(
    modifier = Modifier.width(18.dp).height(18.dp),
    strokeWidth = 2.dp,
    indicatorColor = Color.White,
  )
}

private fun formatWeight(weight: Double): String =
  if (abs(weight - weight.roundToInt()) < 0.01) weight.roundToInt().toString()
  else String.format("%.1f", weight)

private fun formatDuration(totalSeconds: Int): String {
  val minutes = totalSeconds / 60
  val seconds = totalSeconds % 60
  return if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
}
