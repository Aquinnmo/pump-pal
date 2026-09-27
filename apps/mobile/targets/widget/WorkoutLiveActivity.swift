import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private let accent = Color(red: 0xe5 / 255, green: 0x42 / 255, blue: 0x42 / 255)
private let partial = Color(red: 0xfb / 255, green: 0xbf / 255, blue: 0x24 / 255)
private let pending = Color(red: 0x66 / 255, green: 0x66 / 255, blue: 0x66 / 255)
private let secondary = Color(red: 0x88 / 255, green: 0x88 / 255, blue: 0x88 / 255)
private let surface = Color(red: 0x1c / 255, green: 0x1c / 255, blue: 0x1c / 255)
private let outline = Color(red: 0x2a / 255, green: 0x2a / 255, blue: 0x2a / 255)

// Shapes receive a bounded rectangle from SwiftUI: no GeometryReader or fixed
// screen width. Each exercise's share of the track is its share of total sets.
private struct ExerciseSegment: Shape {
  let segments: [WorkoutActivityAttributes.SegmentState]
  let index: Int
  func path(in rect: CGRect) -> Path {
    let total = segments.reduce(0) { $0 + max($1.sets, 0) }
    guard total > 0 else { return Path() }
    let gap = min(4, rect.width / CGFloat(max(segments.count * 2, 1)))
    let width = max(0, rect.width - gap * CGFloat(max(segments.count - 1, 0)))
    let preceding = segments.prefix(index).reduce(0) { $0 + max($1.sets, 0) }
    let x = rect.minX + width * CGFloat(preceding) / CGFloat(total) + gap * CGFloat(index)
    let segmentWidth = width * CGFloat(max(segments[index].sets, 0)) / CGFloat(total)
    return Path(roundedRect: CGRect(x: x, y: rect.midY - 3, width: segmentWidth, height: 6), cornerRadius: 3)
  }
}

private struct SetTracker: Shape {
  let completed: Int
  let total: Int
  func path(in rect: CGRect) -> Path {
    guard total > 0 else { return Path() }
    let progress = CGFloat(min(max(completed, 0), total)) / CGFloat(total)
    let diameter = min(10, rect.width)
    let x = min(max(rect.width * progress - diameter / 2, 0), max(rect.width - diameter, 0))
    return Path(ellipseIn: CGRect(x: rect.minX + x, y: rect.midY - diameter / 2, width: diameter, height: diameter))
  }
}

private struct ExerciseProgress: View {
  let state: WorkoutActivityAttributes.ContentState
  var body: some View {
    ZStack {
      ForEach(Array(state.segments.enumerated()), id: \.offset) { index, segment in
        ExerciseSegment(segments: state.segments, index: index)
          .fill(segment.completed ? accent : segment.started ? partial : pending)
      }
      SetTracker(completed: state.completedSets, total: state.totalSets).fill(.white)
    }
    .frame(height: 12)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Workout exercise progress")
    .accessibilityValue("\(state.segments.filter(\.completed).count) of \(state.segments.count) exercises complete")
  }
}

private struct SetCount: View {
  let state: WorkoutActivityAttributes.ContentState
  var body: some View {
    Text("\(state.completedSets)/\(state.totalSets)")
      .font(.subheadline.weight(.medium).monospacedDigit())
      .lineLimit(1)
      .fixedSize(horizontal: true, vertical: false)
      .accessibilityLabel("\(state.completedSets) of \(state.totalSets) sets complete")
  }
}

private struct ElapsedTime: View {
  let startedAt: Date
  var body: some View {
    Text(timerInterval: startedAt...startedAt.addingTimeInterval(24 * 60 * 60), countsDown: false, showsHours: true)
      .font(.subheadline.weight(.medium).monospacedDigit())
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .frame(width: 80, alignment: .trailing)
      .accessibilityLabel("Workout elapsed time")
  }
}

private struct WorkoutCopy: View {
  let title: String
  let detail: String?
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.headline.weight(.bold)).foregroundStyle(.white)
      if let detail {
        Text(detail).font(.subheadline.weight(.medium)).foregroundStyle(secondary)
      }
    }
    .lineLimit(1)
    .truncationMode(.tail)
    .minimumScaleFactor(0.8)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct ActionControl<I: AppIntent>: View {
  let title: String
  let primary: Bool
  let intent: I
  var body: some View {
    Button(intent: intent) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(.white)
    .background(primary ? accent : outline, in: RoundedRectangle(cornerRadius: 14))
  }
}

private struct WorkoutControls: View {
  let workoutId: String
  let state: WorkoutActivityAttributes.ContentState
  var body: some View {
    if !state.actions.isEmpty {
      HStack(spacing: 8) {
        if state.actions.contains("completeSet") {
          ActionControl(title: "Complete set", primary: true,
            intent: CompleteSetIntent(workoutId: workoutId, expectedCompletedSets: state.completedSets))
        }
        if state.actions.contains("finishWorkout") {
          ActionControl(title: "Finish workout", primary: true,
            intent: FinishWorkoutIntent(workoutId: workoutId, expectedCompletedSets: state.completedSets))
        }
        if state.actions.contains("uncompleteSet") {
          ActionControl(title: "Undo set", primary: false,
            intent: UncompleteSetIntent(workoutId: workoutId, expectedCompletedSets: state.completedSets))
        }
      }
    }
  }
}

private struct ProgressRing: View {
  let completedSets: Int
  let totalSets: Int
  var body: some View {
    let progress = totalSets > 0 ? CGFloat(min(max(completedSets, 0), totalSets)) / CGFloat(totalSets) : 0
    ZStack {
      Circle().stroke(outline, lineWidth: 2.5)
      Circle().trim(from: 0, to: progress)
        .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .frame(width: 16, height: 16)
    .accessibilityLabel("\(completedSets) of \(totalSets) sets complete")
  }
}

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top, spacing: 8) {
          WorkoutCopy(title: context.state.title ?? context.attributes.title, detail: context.state.detail)
          VStack(alignment: .trailing, spacing: 4) {
            ElapsedTime(startedAt: context.attributes.startedAt)
            SetCount(state: context.state).foregroundStyle(secondary)
          }
          .layoutPriority(1)
        }
        ExerciseProgress(state: context.state)
        WorkoutControls(workoutId: context.attributes.workoutId, state: context.state)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .foregroundStyle(.white)
      .activityBackgroundTint(surface)
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          SetCount(state: context.state).frame(maxWidth: .infinity)
        }
        .contentMargins(.horizontal, 4)
        DynamicIslandExpandedRegion(.trailing) {
          ElapsedTime(startedAt: context.attributes.startedAt).frame(maxWidth: .infinity)
        }
        .contentMargins(.horizontal, 4)
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            WorkoutCopy(title: context.state.title ?? context.attributes.title, detail: context.state.detail)
            ExerciseProgress(state: context.state)
            WorkoutControls(workoutId: context.attributes.workoutId, state: context.state)
          }
        }
        .contentMargins(.horizontal, 4)
      } compactLeading: {
        ProgressRing(completedSets: context.state.completedSets, totalSets: context.state.totalSets)
          .accessibilityHidden(true)
      } compactTrailing: {
        SetCount(state: context.state)
      } minimal: {
        ProgressRing(completedSets: context.state.completedSets, totalSets: context.state.totalSets)
      }
      .keylineTint(accent)
    }
  }
}

#if DEBUG
private extension WorkoutActivityAttributes {
  static let preview = WorkoutActivityAttributes(
    workoutId: "preview-workout",
    title: "Logging Push Workout",
    startedAt: Date(timeIntervalSinceNow: -5 * 60)
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
    completedSets: 102,
    totalSets: 122,
    detail: "Single Arm Cable Triceps Pushdown · 8 reps · 25 lbs",
    segments: [
      .init(sets: 40, started: true, completed: true),
      .init(sets: 52, started: true, completed: false),
      .init(sets: 30, started: false, completed: false),
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
    startedAt: Date(timeIntervalSinceNow: -12 * 60 * 60)
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

// For dynamic-type coverage, select Accessibility 3 in the Xcode preview canvas
// Environment Overrides; applying `.environment` to a Widget is unsupported.
#Preview("Lock Screen — long copy (Accessibility 3)", as: .content, using: WorkoutActivityAttributes.longTitlePreview) {
  WorkoutLiveActivity()
} contentStates: {
  WorkoutActivityAttributes.longCopyPreviewState
}

#Preview("Dynamic Island — expanded long title (Accessibility 3)", as: .dynamicIsland(.expanded), using: WorkoutActivityAttributes.longTitlePreview) {
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
