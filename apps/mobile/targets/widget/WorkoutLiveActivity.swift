import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// Flat/numeric, no gradients/glass/glow — matches docs/design-language.md and the
// existing Android AOD styling (Notification.ProgressStyle.Segment colors below).
private let colorComplete = Color(red: 0xE5 / 255, green: 0x42 / 255, blue: 0x42 / 255) // also Timber's one accent
private let colorInProgress = Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)
// Canonical Timber tertiary/placeholder grey from design-language.md.
private let colorPending = Color(red: 0x66 / 255, green: 0x66 / 255, blue: 0x66 / 255)
// Canonical Timber secondary text grey from design-language.md.
private let colorTextSecondary = Color(red: 0x88 / 255, green: 0x88 / 255, blue: 0x88 / 255)
// Chip secondary surface from design-language.md.
private let colorChipSecondary = Color.white.opacity(0.12)
// Ring track grey and the tracker-pip ring, both from design-language.md.
private let colorRingTrack = Color(red: 0x2A / 255, green: 0x2A / 255, blue: 0x2A / 255)
private let colorPipRing = Color(red: 0x0F / 255, green: 0x0F / 255, blue: 0x0F / 255)

private func segmentColor(_ segment: WorkoutActivityAttributes.SegmentState) -> Color {
  if segment.completed { return colorComplete }
  if segment.started { return colorInProgress }
  return colorPending
}

// Bounded/targeted progress indicator (each segment has a known total, per
// docs/design-language.md's rule against rings/bars for untargeted metrics).
// This is Android's Notification.ProgressStyle rebuilt: a capsule track plus the
// tracker pip that makes the Pixel bar recognizable as a bar.
private struct SegmentBar: View {
  let segments: [WorkoutActivityAttributes.SegmentState]
  let completedSets: Int
  let totalSets: Int

  var body: some View {
    GeometryReader { geometry in
      let sumSets = max(segments.reduce(0) { $0 + max($1.sets, 0) }, 1)
      let gap = CGFloat(max(segments.count - 1, 0) * 4)
      let availableWidth = max(geometry.size.width - gap, 0)
      let trackerX = totalSets > 0 ? geometry.size.width * CGFloat(completedSets) / CGFloat(totalSets) : 0

      ZStack(alignment: .leading) {
        HStack(spacing: 4) {
          ForEach(Array(segments.enumerated()), id: \.offset) { index, segment in
            Capsule()
              .fill(segmentColor(segment))
              .frame(width: availableWidth * CGFloat(max(segment.sets, 0)) / CGFloat(sumSets), height: 6)
          }
        }
        if totalSets > 0 {
          Circle()
            .fill(Color.white)
            .frame(width: 10, height: 10)
            .overlay(Circle().stroke(colorPipRing, lineWidth: 2))
            .offset(x: trackerX - 5)
        }
      }
    }
    .frame(height: 10)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Workout exercise progress")
    .accessibilityValue(
      "\(segments.filter(\.completed).count) of \(segments.count) exercises complete"
    )
  }
}

// Minimal-presentation progress indicator. Sets have a real target (totalSets), so
// docs/design-language.md's ring rule — which bans rings on unbounded metrics — permits it.
private struct ProgressRing: View {
  let completedSets: Int
  let totalSets: Int

  var body: some View {
    let progress = totalSets > 0 ? CGFloat(completedSets) / CGFloat(totalSets) : 0
    ZStack {
      Circle()
        .stroke(colorRingTrack, lineWidth: 2.5)
      Circle()
        .trim(from: 0, to: progress)
        .stroke(colorComplete, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .frame(width: 16, height: 16)
  }
}

private struct ActionChip<I: AppIntent>: View {
  let title: String
  let prominent: Bool
  let intent: I

  var body: some View {
    Button(intent: intent) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .frame(maxWidth: .infinity)
        .frame(height: 38)
    }
    .buttonStyle(.plain)
    .background(
      prominent ? colorComplete : colorChipSecondary,
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .foregroundStyle(.white)
  }
}

// Arrangement is driven by context.state.actions, which the domain model emits as
// exactly these combinations (workout-notification-model.ts:96-104). Labels are
// byte-identical to the Android module (LiveUpdateNotificationModule.kt:155-159).
private struct ActionButtons: View {
  let workoutId: String
  let expectedCompletedSets: Int
  let actions: [String]

  var body: some View {
    if actions == ["completeSet"] {
      ActionChip(
        title: "Complete set",
        prominent: true,
        intent: CompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
      )
    } else if actions == ["completeSet", "uncompleteSet"] {
      HStack(spacing: 8) {
        ActionChip(
          title: "Complete set",
          prominent: true,
          intent: CompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
        )
        ActionChip(
          title: "Undo set",
          prominent: false,
          intent: UncompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
        )
      }
    } else if actions == ["finishWorkout", "uncompleteSet"] {
      // Finish full-width, Undo below as a plain text button: the user chose this
      // over two equal chips because both shrink below comfortable size side by
      // side in the Dynamic Island bottom region.
      VStack(spacing: 8) {
        ActionChip(
          title: "Finish workout",
          prominent: true,
          intent: FinishWorkoutIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
        )
        Button(intent: UncompleteSetIntent(workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)) {
          Text("Undo set")
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .frame(maxWidth: .infinity)
            .frame(height: 38)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
      }
    }
  }
}

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      // Lock Screen / banner presentation.
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(context.attributes.title)
            .font(.headline)
            .lineLimit(1)
            .truncationMode(.tail)
            .minimumScaleFactor(0.8)
            .layoutPriority(1)
          Spacer(minLength: 8)
          Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
            .font(.headline.monospacedDigit())
            .lineLimit(1)
        }
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          if let detail = context.state.detail {
            Text(detail)
              .font(.subheadline)
              .foregroundStyle(colorTextSecondary)
              .lineLimit(1)
              .truncationMode(.tail)
              .minimumScaleFactor(0.8)
              .layoutPriority(1)
          }
          Spacer(minLength: 8)
          Text("\(context.state.completedSets)/\(context.state.totalSets)")
            .font(.caption.monospacedDigit())
            .foregroundStyle(colorTextSecondary)
            .accessibilityLabel("Completed sets")
            .accessibilityValue("\(context.state.completedSets) of \(context.state.totalSets)")
        }
        SegmentBar(
          segments: context.state.segments,
          completedSets: context.state.completedSets,
          totalSets: context.state.totalSets
        )
        ActionButtons(
          workoutId: context.attributes.workoutId,
          expectedCompletedSets: context.state.completedSets,
          actions: context.state.actions
        )
      }
      .padding(16)
      .activityBackgroundTint(nil)
      .activitySystemActionForegroundColor(.primary)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("\(context.state.completedSets)/\(context.state.totalSets)")
            .font(.caption2.monospacedDigit())
            .lineLimit(1)
            .accessibilityLabel("Completed sets")
            .accessibilityValue("\(context.state.completedSets) of \(context.state.totalSets)")
        }
        .contentMargins(.horizontal, 4)
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
            .font(.caption.monospacedDigit())
            .lineLimit(1)
        }
        .contentMargins(.horizontal, 4)
        // Copy belongs in bottom rather than leading/center: it gets the full
        // width below the sensor, while the bar and actions stay together.
        DynamicIslandExpandedRegion(.bottom, priority: 1) {
          VStack(alignment: .leading, spacing: 10) {
            Text(context.attributes.title)
              .font(.subheadline.weight(.semibold))
              .lineLimit(1)
              .truncationMode(.tail)
              .minimumScaleFactor(0.8)
              .layoutPriority(1)
              .frame(maxWidth: .infinity, alignment: .leading)
            if let detail = context.state.detail {
              Text(detail)
                .font(.caption)
                .foregroundStyle(colorTextSecondary)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.8)
                .layoutPriority(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            SegmentBar(
              segments: context.state.segments,
              completedSets: context.state.completedSets,
              totalSets: context.state.totalSets
            )
            ActionButtons(
              workoutId: context.attributes.workoutId,
              expectedCompletedSets: context.state.completedSets,
              actions: context.state.actions
            )
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentMargins(.horizontal, 4)
      } compactLeading: {
        // Compact/minimal presentations don't support interactive buttons
        // (Apple platform constraint) — numeric display only.
        Text("\(context.state.completedSets)/\(context.state.totalSets)")
          .font(.caption2.monospacedDigit())
          .minimumScaleFactor(0.7)
          .accessibilityLabel("Completed sets")
          .accessibilityValue("\(context.state.completedSets) of \(context.state.totalSets)")
      } compactTrailing: {
        Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
          .font(.caption2.monospacedDigit())
      } minimal: {
        ProgressRing(completedSets: context.state.completedSets, totalSets: context.state.totalSets)
          .accessibilityLabel("Completed sets")
          .accessibilityValue("\(context.state.completedSets) of \(context.state.totalSets)")
      }
    }
  }
}

#if DEBUG
private extension WorkoutActivityAttributes {
  static let preview = WorkoutActivityAttributes(
    workoutId: "preview-workout",
    title: "Logging Push Workout",
    startedAt: Date(timeIntervalSince1970: 1_700_000_000)
  )

  static let emptyPreviewState = ContentState(
    completedSets: 0,
    totalSets: 0,
    detail: nil,
    segments: [],
    actions: []
  )

  static let activePreviewState = ContentState(
    completedSets: 0,
    totalSets: 9,
    detail: "Bench Press · 10 reps · 135 lbs",
    segments: [
      .init(sets: 2, started: false, completed: false),
      .init(sets: 4, started: false, completed: false),
      .init(sets: 3, started: false, completed: false),
    ],
    actions: ["completeSet"]
  )

  static let partialPreviewState = ContentState(
    completedSets: 3,
    totalSets: 9,
    detail: "Incline Dumbbell Press · 8 reps · 55 lbs",
    segments: [
      .init(sets: 2, started: true, completed: true),
      .init(sets: 4, started: true, completed: false),
      .init(sets: 3, started: false, completed: false),
    ],
    actions: ["completeSet", "uncompleteSet"]
  )

  static let longCopyPreviewState = ContentState(
    completedSets: 3,
    totalSets: 9,
    detail: "Incline Dumbbell Press · 8 reps · 55 lbs · controlled eccentric tempo",
    segments: [
      .init(sets: 2, started: true, completed: true),
      .init(sets: 4, started: true, completed: false),
      .init(sets: 3, started: false, completed: false),
    ],
    actions: ["completeSet", "uncompleteSet"]
  )

  static let completePreviewState = ContentState(
    completedSets: 9,
    totalSets: 9,
    detail: nil,
    segments: [
      .init(sets: 2, started: true, completed: true),
      .init(sets: 4, started: true, completed: true),
      .init(sets: 3, started: true, completed: true),
    ],
    actions: ["finishWorkout", "uncompleteSet"]
  )

  static let durationPreviewState = ContentState(
    completedSets: 1,
    totalSets: 3,
    detail: "Plank · 0:45",
    segments: [.init(sets: 3, started: true, completed: false)],
    actions: ["completeSet", "uncompleteSet"]
  )

  static let longTitlePreview = WorkoutActivityAttributes(
    workoutId: "preview-long-workout",
    title: "Logging Very Long Upper Body Strength Session Workout",
    startedAt: Date(timeIntervalSince1970: 1_700_000_000)
  )
}

#Preview("Lock Screen — empty", as: .content, using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.emptyPreviewState
}

#Preview("Lock Screen — active", as: .content, using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.activePreviewState
}

#Preview("Lock Screen — partial", as: .content, using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.partialPreviewState
}

#Preview("Lock Screen — complete", as: .content, using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.completePreviewState
}

#Preview("Lock Screen — duration", as: .content, using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.durationPreviewState
}

#Preview("Lock Screen — long copy", as: .content, using: WorkoutActivityAttributes.longTitlePreview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.longCopyPreviewState
}

#Preview("Dynamic Island — expanded long title", as: .dynamicIsland(.expanded), using: WorkoutActivityAttributes.longTitlePreview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.longCopyPreviewState
}

#Preview("Dynamic Island — expanded single action", as: .dynamicIsland(.expanded), using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.activePreviewState
}

#Preview("Dynamic Island — compact", as: .dynamicIsland(.compact), using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.activePreviewState
}

#Preview("Dynamic Island — minimal", as: .dynamicIsland(.minimal), using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.completePreviewState
}

#Preview("Dynamic Island — minimal partial", as: .dynamicIsland(.minimal), using: WorkoutActivityAttributes.preview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.partialPreviewState
}
#endif
