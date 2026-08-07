import ActivityKit
import SwiftUI
import WidgetKit

// Flat/numeric, no gradients/glass/glow — matches docs/design-language.md and the
// existing Android AOD styling (Notification.ProgressStyle.Segment colors below).
private let colorComplete = Color(red: 0xE5 / 255, green: 0x42 / 255, blue: 0x42 / 255)
private let colorInProgress = Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)
private let colorPending = Color(red: 0x55 / 255, green: 0x55 / 255, blue: 0x55 / 255)

private func segmentColor(_ segment: WorkoutActivityAttributes.SegmentState) -> Color {
  if segment.completed { return colorComplete }
  if segment.started { return colorInProgress }
  return colorPending
}

// Bounded/targeted progress indicator (each segment has a known total, per
// docs/design-language.md's rule against rings/bars for untargeted metrics).
private struct SegmentBar: View {
  let segments: [WorkoutActivityAttributes.SegmentState]

  var body: some View {
    HStack(spacing: 3) {
      ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
        RoundedRectangle(cornerRadius: 2)
          .fill(segmentColor(segment))
          .frame(height: 4)
    }
    }
  }
}

private struct ActionButtons: View {
  let workoutId: String
  let expectedCompletedSets: Int
  let actions: [String]

  var body: some View {
    HStack(spacing: 8) {
      if actions.contains("completeSet") {
        Button(intent: CompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)) {
          Text("Complete Set")
        }
      }
      if actions.contains("uncompleteSet") {
        Button(intent: UncompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)) {
          Text("Undo")
        }
      }
      if actions.contains("finishWorkout") {
        Button(intent: FinishWorkoutIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)) {
          Text("Finish")
        }
      }
    }
    .font(.caption)
  }
}

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      // Lock Screen / banner presentation.
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(context.attributes.title)
            .font(.headline)
          Spacer()
          Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
            .font(.headline.monospacedDigit())
        }
        if let detail = context.state.detail {
          Text(detail)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        SegmentBar(segments: context.state.segments)
        HStack {
          Text("\(context.state.completedSets)/\(context.state.totalSets)")
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
          Spacer()
          ActionButtons(
            workoutId: context.attributes.workoutId,
            expectedCompletedSets: context.state.completedSets,
            actions: context.state.actions
          )
        }
      }
      .padding()
      .activityBackgroundTint(nil)
      .activitySystemActionForegroundColor(.primary)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading) {
            Text(context.attributes.title).font(.caption).lineLimit(1)
            if let detail = context.state.detail {
              Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
            .font(.caption.monospacedDigit())
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 6) {
            SegmentBar(segments: context.state.segments)
            ActionButtons(
              workoutId: context.attributes.workoutId,
              expectedCompletedSets: context.state.completedSets,
              actions: context.state.actions
            )
          }
        }
      } compactLeading: {
        // Compact/minimal presentations don't support interactive buttons
        // (Apple platform constraint) — numeric display only.
        Text("\(context.state.completedSets)/\(context.state.totalSets)")
          .font(.caption2.monospacedDigit())
      } compactTrailing: {
        Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
          .font(.caption2.monospacedDigit())
      } minimal: {
        Text("\(context.state.completedSets)/\(context.state.totalSets)")
          .font(.caption2.monospacedDigit())
      }
    }
  }
}
