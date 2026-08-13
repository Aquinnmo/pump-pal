import ActivityKit
import AppIntents

// Each intent runs insulated in the Live Activity's own process (LiveActivityIntent,
// iOS 17+) so a tap updates the Island/Lock Screen instantly even if the host app is
// fully terminated — no foregrounding required. See plan doc section 3 for the full
// design: this only updates the Activity locally and leaves a durable record (the App
// Group outbox) for the RN app to reconcile against its real domain state next time
// it's alive; it deliberately does not recompute the app's full next-set cursor logic
// (utils/wear-state.ts's nextSetIndex) — `detail` may be briefly stale until JS
// reconciles, an accepted staleness window (see plan's Risks section).

private func applySetDelta(_ state: LiveUpdateSharedStore.StoredState, delta: Int) -> LiveUpdateSharedStore.StoredState {
  var next = state
  next.completedSets = max(0, min(state.totalSets, state.completedSets + delta))

  // Bounded mirror of the counting semantics in utils/wear-state.ts's applyWearAction:
  // walk segments in order, marking/unmarking sets from the front, without touching
  // `detail` (left stale on purpose — see header comment).
  var remaining = next.completedSets
  next.segments = state.segments.map { segment in
    var s = segment
    if remaining >= segment.sets {
      s.started = segment.sets > 0
      s.completed = segment.sets > 0
      remaining -= segment.sets
    } else if remaining > 0 {
      s.started = true
      s.completed = false
      remaining = 0
    } else {
      s.started = false
      s.completed = false
    }
    return s
  }
  return next
}

@available(iOS 17.0, *)
private func performSetAction(
  action: String,
  workoutId: String,
  expectedCompletedSets: Int,
  delta: Int
) async {
  guard let stored = LiveUpdateSharedStore.loadState(),
        stored.workoutId == workoutId,
        stored.completedSets == expectedCompletedSets else { return }

  let next = applySetDelta(stored, delta: delta)
  LiveUpdateSharedStore.saveState(next)

  let contentState = WorkoutActivityAttributes.ContentState(
    completedSets: next.completedSets,
    totalSets: next.totalSets,
    detail: next.detail,
    segments: next.segments,
    actions: next.actions
  )
  if let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.attributes.workoutId == workoutId }) {
    await activity.update(ActivityContent(state: contentState, staleDate: nil))
  }

  LiveUpdateSharedStore.writePendingAction(
    .init(action: action, workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
  )
  // Best-effort: only reaches a live host-app process. The outbox write above is the
  // durable path a terminated app picks up on next launch (see
  // utils/live-update-notification-actions.ios.ts's drain-on-subscribe).
  LiveUpdateSharedStore.postActionDarwinNotification()
}

@available(iOS 17.0, *)
public struct CompleteSetIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Complete Set"

  @Parameter(title: "Workout ID")
  public var workoutId: String

  @Parameter(title: "Expected Completed Sets")
  public var expectedCompletedSets: Int

  public init() {}

  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }

  public func perform() async throws -> some IntentResult {
    await performSetAction(
      action: "completeSet",
      workoutId: workoutId,
      expectedCompletedSets: expectedCompletedSets,
      delta: 1
    )
    return .result()
  }
}

@available(iOS 17.0, *)
public struct UncompleteSetIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Undo Set"

  @Parameter(title: "Workout ID")
  public var workoutId: String

  @Parameter(title: "Expected Completed Sets")
  public var expectedCompletedSets: Int

  public init() {}

  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }

  public func perform() async throws -> some IntentResult {
    await performSetAction(
      action: "uncompleteSet",
      workoutId: workoutId,
      expectedCompletedSets: expectedCompletedSets,
      delta: -1
    )
    return .result()
  }
}

// Cannot write to the database from the extension process, and the RN app's in-memory
// active-workout-session.ts doesn't persist across process death — so this only ends
// the Activity locally and leaves the outbox entry for JS to act on if the app is
// still alive. Matches Android: utils/wear-action-task.ts's handleWorkoutAction
// explicitly refuses 'finishWorkout' for the same reason. Not a regression.
@available(iOS 17.0, *)
public struct FinishWorkoutIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Finish Workout"

  @Parameter(title: "Workout ID")
  public var workoutId: String

  @Parameter(title: "Expected Completed Sets")
  public var expectedCompletedSets: Int

  public init() {}

  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }

  public func perform() async throws -> some IntentResult {
    LiveUpdateSharedStore.writePendingAction(
      .init(action: "finishWorkout", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    )
    LiveUpdateSharedStore.postActionDarwinNotification()
    if let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.attributes.workoutId == workoutId }) {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    LiveUpdateSharedStore.clearState()
    return .result()
  }
}
