import Foundation

// Duplicate of modules/live-update-notification/ios/LiveUpdateSharedStore.swift.
// The widget-extension target (this file) and the Expo module target (CocoaPods) are
// separate build units — see the note in WorkoutActivityAttributes.swift for why this
// isn't a single shared file. Keep both copies in sync by hand.
public enum LiveUpdateSharedStore {
  public static let appGroupId = "group.com.aquinnmo.timber.liveactivity"

  private static let stateKey = "com.aquinnmo.timber.liveupdate.state"
  private static let pendingActionKey = "com.aquinnmo.timber.liveupdate.pendingAction"
  public static let actionPostedDarwinNotification = "com.aquinnmo.timber.liveupdate.actionPosted"

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

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
  }

  public struct PendingAction: Codable {
    public var action: String
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
