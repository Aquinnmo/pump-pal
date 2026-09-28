#if canImport(LiveUpdateNotification)
internal import LiveUpdateNotification
internal import Expo
import React
import UIKit
#endif
import AppIntents
import Foundation

// Every tap commits to the App Group store and updates ActivityKit natively; JS
// replays the journal later. A stale or rejected tap republishes the stored
// truth instead of failing, and never applies twice.
//
// All three are LiveActivityIntents so they run in the app process: the widget
// extension's Activity.activities is always empty (measured on iOS 27), so a
// plain AppIntent there can commit but never update what the user sees.
@available(iOS 17.0, *)
@discardableResult
private func performWorkoutAction(_ action: String, workoutId: String, expectedCompletedSets: Int) async
  -> LiveUpdateSharedStore.JournalEntry? {
  let startedAtMs = Date().timeIntervalSince1970 * 1000
  let traceId = UUID().uuidString
  LiveUpdateSharedStore.logLatency(traceId, phase: "intent.entry.\(action)", startedAtMs: startedAtMs)
  let entry = LiveUpdateSharedStore.commit(action, workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
  LiveUpdateSharedStore.logLatency(traceId, phase: entry == nil ? "intent.stale" : "intent.committed", startedAtMs: startedAtMs)
  await LiveUpdateSharedStore.publishLatest(workoutId: workoutId)
  LiveUpdateSharedStore.logLatency(traceId, phase: "intent.published", startedAtMs: startedAtMs)
  if entry != nil { LiveUpdateSharedStore.postActionDarwinNotification() }
  return entry
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
    await performWorkoutAction("completeSet", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
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
    await performWorkoutAction("uncompleteSet", workoutId: workoutId, expectedCompletedSets: expectedCompletedSets)
    return .result()
  }
}

// Also starts JS so the workout is saved right away. The activity ends before JS
// starts; the durable journal covers a save that outlives this.
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
    guard let entry = await performWorkoutAction("finishWorkout", workoutId: workoutId,
      expectedCompletedSets: expectedCompletedSets) else { return .result() }
#if canImport(LiveUpdateNotification)
    await startWorkoutRuntime()
    let deadline = ContinuousClock.now.advanced(by: .seconds(20))
    while ContinuousClock.now < deadline, LiveUpdateSharedStore.loadJournal().contains(where: { $0.id == entry.id }) {
      try? await Task.sleep(for: .milliseconds(250))
    }
#else
    _ = entry
#endif
    return .result()
  }
}
