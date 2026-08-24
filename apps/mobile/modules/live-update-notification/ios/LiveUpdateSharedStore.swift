import Foundation

// App Group bridge between the host-app Expo module and the widget-extension's App
// Intents, which run in a separate process and can't reach the RN app's in-memory
// active-workout-session.ts singleton directly (see plan doc for why this exists —
// there is no iOS analog of Android's same-process headless-JS fallback).
//
// NOTE: duplicated byte-for-byte at targets/widget/LiveUpdateSharedStore.swift for the
// same cross-target reason documented in WorkoutActivityAttributes.swift.
public enum LiveUpdateSharedStore {
  // Must match the App Group entitlement declared on both the host app target and the
  // widget-extension target in app.json / the apple-targets config.
  public static let appGroupId = "group.com.aquinnmo.timber.liveactivity"

  private static let stateKey = "com.aquinnmo.timber.liveupdate.state"
  private static let pendingActionKey = "com.aquinnmo.timber.liveupdate.pendingAction"
  public static let actionPostedDarwinNotification = "com.aquinnmo.timber.liveupdate.actionPosted"

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  // Last-known content state, kept alongside the fixed attributes so an App Intent can
  // compute a next state without needing to look the Activity up first.
  public struct StoredState: Codable {
    public var workoutId: String
    public var completedSets: Int
    public var totalSets: Int
    public var detail: String?
    public var segments: [WorkoutActivityAttributes.SegmentState]
    public var actions: [String]

    public init(
      workoutId: String,
      completedSets: Int,
      totalSets: Int,
      detail: String?,
      segments: [WorkoutActivityAttributes.SegmentState],
      actions: [String]
    ) {
      self.workoutId = workoutId
      self.completedSets = completedSets
      self.totalSets = totalSets
      self.detail = detail
      self.segments = segments
      self.actions = actions
    }

    public var asContentState: WorkoutActivityAttributes.ContentState {
      WorkoutActivityAttributes.ContentState(
        completedSets: completedSets,
        totalSets: totalSets,
        detail: detail,
        segments: segments,
        actions: actions
      )
    }
  }

  public struct PendingAction: Codable {
    public var action: String // 'completeSet' | 'uncompleteSet' | 'finishWorkout'
    public var workoutId: String
    public var expectedCompletedSets: Int

    public init(action: String, workoutId: String, expectedCompletedSets: Int) {
      self.action = action
      self.workoutId = workoutId
      self.expectedCompletedSets = expectedCompletedSets
    }
  }

  public static func saveState(_ state: StoredState) {
    guard let data = try? JSONEncoder().encode(state) else { return }
    defaults?.set(data, forKey: stateKey)
  }

  public static func loadState() -> StoredState? {
    guard let data = defaults?.data(forKey: stateKey) else { return nil }
    return try? JSONDecoder().decode(StoredState.self, from: data)
  }

  public static func clearState() {
    defaults?.removeObject(forKey: stateKey)
  }

  public static func clearPendingAction() {
    defaults?.removeObject(forKey: pendingActionKey)
  }

  // Single pending-action slot: only the latest tap matters for reconciliation, and
  // action taps are inherently serialized by the user tapping one button at a time.
  public static func writePendingAction(_ action: PendingAction) {
    guard let data = try? JSONEncoder().encode(action) else { return }
    defaults?.set(data, forKey: pendingActionKey)
  }

  public static func drainPendingAction() -> PendingAction? {
    guard let data = defaults?.data(forKey: pendingActionKey) else { return nil }
    defaults?.removeObject(forKey: pendingActionKey)
    return try? JSONDecoder().decode(PendingAction.self, from: data)
  }

  public static func postActionDarwinNotification() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(actionPostedDarwinNotification as CFString),
      nil,
      nil,
      true
    )
  }
}
