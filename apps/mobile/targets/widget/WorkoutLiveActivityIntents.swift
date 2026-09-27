#if canImport(LiveUpdateNotification)
internal import LiveUpdateNotification
internal import Expo
import React
import UIKit
#endif
import AppIntents
import Foundation

private enum WorkoutIntentError: Error, LocalizedError {
  case unavailable, busy, rejected, timedOut
  var errorDescription: String? {
    switch self {
    case .unavailable: "This workout is no longer available."
    case .busy: "The previous action is still processing."
    case .rejected: "Could not update the workout. Try again."
    case .timedOut: "Timber could not respond. Try again when it is available."
    }
  }
}

// LiveActivityIntent runs in the host APP's process, without opening its UI.
// The intent grants runtime while JS restores and commits the authoritative draft.
@available(iOS 17.0, *)
private func performWorkoutAction(action: String, workoutId: String, expectedCompletedSets: Int) async throws {
  guard let stored = LiveUpdateSharedStore.loadState(), stored.workoutId == workoutId,
        expectedCompletedSets >= 0, stored.completedSets == expectedCompletedSets,
        stored.actions.contains(action) else { throw WorkoutIntentError.unavailable }
  let pending = LiveUpdateSharedStore.PendingAction(actionId: UUID().uuidString,
    action: action, workoutId: workoutId, expectedCompletedSets: expectedCompletedSets, createdAt: Date())
  guard LiveUpdateSharedStore.enqueue(pending) else { throw WorkoutIntentError.busy }
#if canImport(LiveUpdateNotification)
  await startWorkoutRuntime()
#endif
  LiveUpdateSharedStore.postActionDarwinNotification()
  // Bounded to the intent's runtime; the durable record survives suspension.
  // No speculative ActivityKit update and no detached fire-and-forget task.
  let deadline = ContinuousClock.now.advanced(by: .seconds(15))
  while ContinuousClock.now < deadline {
    if let result = LiveUpdateSharedStore.result(for: pending.actionId) {
      LiveUpdateSharedStore.release(pending.actionId)
      guard result.succeeded else { throw WorkoutIntentError.rejected }
      return
    }
    try await Task.sleep(for: .milliseconds(100))
  }
  throw WorkoutIntentError.timedOut
}

#if canImport(LiveUpdateNotification)
@MainActor
private func startWorkoutRuntime() {
  guard let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
        let factory = provider.reactNativeFactory else { return }
  // Expo's scene lifecycle starts JS only when a window connects. An intent
  // starts the existing factory's host without a scene, window, or root view.
  factory.rootViewFactory.initializeReactHost(launchOptions: nil,
    bundleConfiguration: factory.bundleConfiguration,
    devMenuConfiguration: factory.devMenuConfiguration ?? RCTDevMenuConfiguration.default())
}
#endif

@available(iOS 17.0, *)
public struct CompleteSetIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Complete Set"
  public static var openAppWhenRun: Bool = false
  @Parameter(title: "Workout ID") public var workoutId: String
  @Parameter(title: "Expected Completed Sets") public var expectedCompletedSets: Int
  public init() {}
  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }
  public func perform() async throws -> some IntentResult {
    try await performWorkoutAction(action: "completeSet", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    return .result()
  }
}

@available(iOS 17.0, *)
public struct UncompleteSetIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Undo Set"
  public static var openAppWhenRun: Bool = false
  @Parameter(title: "Workout ID") public var workoutId: String
  @Parameter(title: "Expected Completed Sets") public var expectedCompletedSets: Int
  public init() {}
  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }
  public func perform() async throws -> some IntentResult {
    try await performWorkoutAction(action: "uncompleteSet", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    return .result()
  }
}

@available(iOS 17.0, *)
public struct FinishWorkoutIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Finish Workout"
  public static var openAppWhenRun: Bool = false
  @Parameter(title: "Workout ID") public var workoutId: String
  @Parameter(title: "Expected Completed Sets") public var expectedCompletedSets: Int
  public init() {}
  public init(workoutId: String, expectedCompletedSets: Int) {
    self.workoutId = workoutId
    self.expectedCompletedSets = expectedCompletedSets
  }
  public func perform() async throws -> some IntentResult {
    try await performWorkoutAction(action: "finishWorkout", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    return .result()
  }
}
