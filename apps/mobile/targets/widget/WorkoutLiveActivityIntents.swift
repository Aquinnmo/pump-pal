// The app target gets this file via plugins/with-live-activity-intents.js, where these
// types come from the LiveUpdateNotification pod (useFrameworks: static makes it a real
// Swift module). In the widget extension the pod is absent and the same types come from
// this folder's own copies, so canImport is false and the import is skipped.
//
// `internal` is required, not stylistic: Pods-Timber/ExpoModulesProvider.swift already
// imports this module as `internal import`, and Swift rejects a bare `import` elsewhere
// in the same module as an ambiguous implicit access level.
#if canImport(LiveUpdateNotification)
internal import LiveUpdateNotification
#endif
import AppIntents
import Foundation

// Each intent runs in the host APP's process (LiveActivityIntent, iOS 17+) — that is
// the entire reason the protocol exists instead of plain AppIntent, which would run in
// the widget extension. It leaves a durable App Group record for the host app to
// reconcile when it is alive. The host remains authoritative: intents do not
// recompute the app's next-set cursor or update/dismiss the Activity before JS
// validates the mutation.

@available(iOS 17.0, *)
private func performSetAction(
  action: String,
  workoutId: String,
  expectedCompletedSets: Int
) async {
  guard let stored = LiveUpdateSharedStore.loadState() else {
    NSLog("WorkoutLiveActivityIntents: rejected \(action) — no stored state")
    return
  }
  guard stored.workoutId == workoutId else {
    NSLog("WorkoutLiveActivityIntents: rejected \(action) — workoutId mismatch (stored \(stored.workoutId), tapped \(workoutId))")
    return
  }
  guard expectedCompletedSets >= 0, stored.completedSets == expectedCompletedSets else {
    NSLog("WorkoutLiveActivityIntents: rejected \(action) — expected-count mismatch (stored \(stored.completedSets), expected \(expectedCompletedSets))")
    return
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
      expectedCompletedSets: expectedCompletedSets
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
      expectedCompletedSets: expectedCompletedSets
    )
    return .result()
  }
}

// Cannot write to the database from the extension process, and the RN app's in-memory
// active-workout-session.ts doesn't persist across process death. The host app remains
// authoritative: this only queues the action, and the host redraws or dismisses after
// validating and applying it. In particular, a force-quit tap must not claim that data
// persisted by advancing or ending the Live Activity locally.
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
    guard let stored = LiveUpdateSharedStore.loadState() else {
      NSLog("WorkoutLiveActivityIntents: rejected finishWorkout — no stored state")
      return .result()
    }
    guard stored.workoutId == workoutId else {
      NSLog("WorkoutLiveActivityIntents: rejected finishWorkout — workoutId mismatch (stored \(stored.workoutId), tapped \(workoutId))")
      return .result()
    }
    guard expectedCompletedSets >= 0, stored.completedSets == expectedCompletedSets else {
      NSLog("WorkoutLiveActivityIntents: rejected finishWorkout — expected-count mismatch (stored \(stored.completedSets), expected \(expectedCompletedSets))")
      return .result()
    }
    LiveUpdateSharedStore.writePendingAction(
      .init(action: "finishWorkout", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    )
    LiveUpdateSharedStore.postActionDarwinNotification()
    return .result()
  }
}
