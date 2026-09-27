import Foundation

/// Durable, coordinated handoff between the host app and its Live Activity intent.
public enum LiveUpdateSharedStore {
  public static let appGroupId = "group.com.aquinnmo.timber.lkpt5wjq99.liveactivity"
  public static let actionPostedDarwinNotification = "com.aquinnmo.timber.liveupdate.actionPosted"

  public struct StoredState: Codable {
    public var workoutId: String
    public var content: WorkoutActivityAttributes.ContentState
    public var completedSets: Int { content.completedSets }
    public var actions: [String] { content.actions }
  }

  public struct PendingAction: Codable {
    public var actionId: String
    public var action: String
    public var workoutId: String
    public var expectedCompletedSets: Int
    public var createdAt: Date
    public init(actionId: String, action: String, workoutId: String, expectedCompletedSets: Int, createdAt: Date) {
      self.actionId = actionId
      self.action = action
      self.workoutId = workoutId
      self.expectedCompletedSets = expectedCompletedSets
      self.createdAt = createdAt
    }
  }

  public struct ActionResult: Codable {
    public var actionId: String
    public var succeeded: Bool
  }

  // Coordinate the directory so checking/claiming the one slot is atomic across
  // processes. Intents never write a speculative workout or ActivityKit state.
  private static func access<T>(_ body: (URL) -> T) -> T? {
    guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return nil }
    var result: T?
    var error: NSError?
    NSFileCoordinator().coordinate(writingItemAt: directory, options: [], error: &error) { url in
      result = body(url)
    }
    if let error { NSLog("[Live Activity] App Group access failed: \(error)") }
    return result
  }

  private static func read<T: Decodable>(_ name: String, at directory: URL) -> T? {
    guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
  }

  private static func write<T: Encodable>(_ value: T, name: String, at directory: URL) -> Bool {
    do {
      try JSONEncoder().encode(value).write(to: directory.appendingPathComponent(name), options: .atomic)
      return true
    } catch {
      NSLog("[Live Activity] App Group write failed: \(error)")
      return false
    }
  }

  public static func saveState(_ state: StoredState) -> Bool {
    access { write(state, name: "workout-state.json", at: $0) } ?? false
  }

  public static func loadState() -> StoredState? {
    access { read("workout-state.json", at: $0) as StoredState? } ?? nil
  }

  public static func clearState() {
    _ = access { try? FileManager.default.removeItem(at: $0.appendingPathComponent("workout-state.json")) }
  }

  public static func loadPendingAction() -> PendingAction? {
    access { read("workout-action.json", at: $0) as PendingAction? } ?? nil
  }

  public static func enqueue(_ action: PendingAction) -> Bool {
    access { directory in
      if let pending: PendingAction = read("workout-action.json", at: directory),
         pending.workoutId == action.workoutId, Date().timeIntervalSince(pending.createdAt) < 30 {
        return false
      }
      // Receipts are per tap so a subsequent tap cannot overwrite one an intent
      // is still awaiting. Remove abandoned receipts beyond the intent's runtime.
      for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        where url.lastPathComponent.hasPrefix("workout-result-") {
        if let modified = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
           Date().timeIntervalSince(modified) > 30 { try? FileManager.default.removeItem(at: url) }
      }
      return write(action, name: "workout-action.json", at: directory)
    } ?? false
  }

  public static func acknowledge(_ actionId: String, succeeded: Bool) {
    guard UUID(uuidString: actionId) != nil else { return }
    _ = access { directory in
      guard let pending: PendingAction = read("workout-action.json", at: directory), pending.actionId == actionId else { return }
      if write(ActionResult(actionId: actionId, succeeded: succeeded), name: "workout-result-\(actionId).json", at: directory) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("workout-action.json"))
      }
    }
  }

  public static func result(for actionId: String) -> ActionResult? {
    guard UUID(uuidString: actionId) != nil else { return nil }
    let result: ActionResult? = access { read("workout-result-\(actionId).json", at: $0) as ActionResult? } ?? nil
    return result?.actionId == actionId ? result : nil
  }

  public static func release(_ actionId: String) {
    guard UUID(uuidString: actionId) != nil else { return }
    _ = access { try? FileManager.default.removeItem(at: $0.appendingPathComponent("workout-result-\(actionId).json")) }
  }

  public static func postActionDarwinNotification() {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(actionPostedDarwinNotification as CFString), nil, nil, true)
  }
}
