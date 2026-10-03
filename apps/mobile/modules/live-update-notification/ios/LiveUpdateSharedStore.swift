#if os(iOS)
import ActivityKit
#endif
import Foundation

/// Durable workout state shared by the host app and its Live Activity intents.
/// A tap commits here and publishes natively; JS later replays the journal into
/// its draft, so no button ever waits for the React runtime.
public enum LiveUpdateSharedStore {
  public static let appGroupId = "group.com.aquinnmo.timber.lkpt5wjq99.liveactivity"
  public static let actionPostedDarwinNotification = "com.aquinnmo.timber.liveupdate.actionPosted"
  private static let stateFile = "workout-state-v2.json"
  private static let journalFile = "workout-journal.json"

  /// One tappable part: a simple set, or one part of a drop set.
  public struct StoredSet: Codable, Equatable {
    public var completed: Bool
    public var detail: String
    /// false for a drop continuing the set before it. nil (state written by an older
    /// build) means true: every part was its own set then.
    public var startsSet: Bool?
    public init(completed: Bool, detail: String, startsSet: Bool = true) {
      self.completed = completed
      self.detail = detail
      self.startsSet = startsSet
    }
  }

  public struct JournalEntry: Codable, Equatable {
    public var id: String
    public var action: String
    public var workoutId: String
    public var expectedCompletedSets: Int
    public var atMs: Double
  }

  public struct StoredState: Codable, Equatable {
    public var workoutId: String
    public var title: String
    public var startedAt: Date
    // Per segment (exercise or superset), how many sets it holds — a drop set is one.
    // `sets` is every tappable part, flattened; setRanges groups parts into sets.
    public var rowSetCounts: [Int]
    public var sets: [StoredSet]
    public var finished = false
    public var revision = 0

    public init?(workoutId: String, title: String, startedAt: Date, rowSetCounts: [Int], sets: [StoredSet]) {
      guard !workoutId.isEmpty, rowSetCounts.allSatisfy({ $0 >= 0 }),
            rowSetCounts.reduce(0, +) == Self.setRanges(sets).count else { return nil }
      self.workoutId = workoutId
      self.title = title
      self.startedAt = startedAt
      self.rowSetCounts = rowSetCounts
      self.sets = sets
    }

    private var lastCompleted: Int? { sets.lastIndex { $0.completed } }

    /// The part indices of each set, in order: a set runs from its start to the next.
    static func setRanges(_ sets: [StoredSet]) -> [Range<Int>] {
      let starts = sets.indices.filter { $0 == 0 || sets[$0].startsSet ?? true }
      return starts.enumerated().map { k, start in start..<(k + 1 < starts.count ? starts[k + 1] : sets.count) }
    }

    /// Mirrors buildWorkoutNotificationPresentation (src/lib/workout-notification-model.ts).
    public var content: WorkoutActivityAttributes.ContentState {
      let completedParts = sets.filter(\.completed).count
      let ranges = Self.setRanges(sets)
      let completedSets = ranges.filter { sets[$0].allSatisfy(\.completed) }.count
      let next = (lastCompleted ?? -1) + 1
      var actions: [String] = []
      if !finished && !sets.isEmpty {
        if next >= sets.count { actions = ["finishWorkout", "uncompleteSet"] }
        else if completedParts == 0 { actions = ["completeSet"] }
        else { actions = ["completeSet", "uncompleteSet"] }
      }
      // Each segment takes the next `count` sets; its parts are their combined range.
      var offset = 0
      let segments = rowSetCounts.map { count -> WorkoutActivityAttributes.SegmentState in
        let owned = ranges[min(offset, ranges.count)..<min(offset + count, ranges.count)]
        offset += count
        let row = owned.isEmpty ? sets[0..<0] : sets[owned.first!.lowerBound..<owned.last!.upperBound]
        return .init(sets: count, started: row.contains { $0.completed },
          completed: count > 0 && row.allSatisfy { $0.completed })
      }
      let detail = next < sets.count ? sets[next].detail : ""
      return .init(completedSets: completedSets, totalSets: ranges.count, detail: detail.isEmpty ? nil : detail,
        segments: segments, actions: actions, title: title, completedParts: completedParts)
    }

    /// The same cursor as applyWearAction (src/lib/wear-state.ts).
    mutating func apply(_ action: String) -> Bool {
      switch action {
      case "completeSet":
        let next = (lastCompleted ?? -1) + 1
        guard next < sets.count else { return false }
        sets[next].completed = true
      case "uncompleteSet":
        guard let last = lastCompleted else { return false }
        sets[last].completed = false
      case "finishWorkout":
        finished = true
      default:
        return false
      }
      return true
    }
  }

  public static func logLatency(_ id: String?, phase: String, startedAtMs: Double?) {
    guard let id, let startedAtMs else { return }
    NSLog("[live-activity-latency] id=%@ phase=%@ elapsedMs=%.0f", id, phase,
      Date().timeIntervalSince1970 * 1000 - startedAtMs)
  }

  // Coordinating the directory makes each read-modify-write atomic across the
  // app and extension processes.
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

  public static func loadState() -> StoredState? {
    access { read(stateFile, at: $0) as StoredState? } ?? nil
  }

  public enum ReplaceOutcome { case saved, deferred, failed }

  /// The app's presentation replaces the stored one, except while native taps on
  /// the same workout still await JS replay: overwriting would undo them.
  public static func replace(with state: StoredState) -> ReplaceOutcome {
    access { directory -> ReplaceOutcome in
      let journal: [JournalEntry] = read(journalFile, at: directory) ?? []
      if journal.contains(where: { $0.workoutId == state.workoutId }) { return .deferred }
      var next = state
      next.revision = ((read(stateFile, at: directory) as StoredState?)?.revision ?? 0) + 1
      return write(next, name: stateFile, at: directory) ? .saved : .failed
    } ?? .failed
  }

  /// Leaves the journal: a queued Finish must survive dismissal until JS saves it.
  public static func clearState() {
    _ = access { try? FileManager.default.removeItem(at: $0.appendingPathComponent(stateFile)) }
  }

  /// Validates the tap against the stored state and applies it. The journal is
  /// written first so a crash between the two writes replays rather than loses it.
  public static func commit(_ action: String, workoutId: String, expectedCompletedSets: Int) -> JournalEntry? {
    access { directory -> JournalEntry? in
      guard var state: StoredState = read(stateFile, at: directory), state.workoutId == workoutId, !state.finished else { return nil }
      let content = state.content
      // The guard counts parts, so a stale or repeated tap is caught even mid drop set.
      guard (content.completedParts ?? content.completedSets) == expectedCompletedSets, content.actions.contains(action),
            state.apply(action) else { return nil }
      state.revision += 1
      let journal: [JournalEntry] = read(journalFile, at: directory) ?? []
      let entry = JournalEntry(id: UUID().uuidString, action: action, workoutId: workoutId,
        expectedCompletedSets: expectedCompletedSets, atMs: Date().timeIntervalSince1970 * 1000)
      guard write(journal + [entry], name: journalFile, at: directory) else { return nil }
      guard write(state, name: stateFile, at: directory) else {
        _ = write(journal, name: journalFile, at: directory)
        return nil
      }
      return entry
    } ?? nil
  }

  public static func loadJournal() -> [JournalEntry] {
    (access { read(journalFile, at: $0) as [JournalEntry]? } ?? nil) ?? []
  }

  public static func acknowledge(_ ids: [String]) -> Bool {
    access { directory -> Bool in
      let journal: [JournalEntry] = read(journalFile, at: directory) ?? []
      let remaining = journal.filter { !ids.contains($0.id) }
      return remaining.count == journal.count || write(remaining, name: journalFile, at: directory)
    } ?? false
  }

  /// What the home-screen Up next widget renders. Mirrors WidgetUpNext
  /// (src/lib/widget-up-next.tsx), including its per-field fallback.
  public struct UpNext: Codable, Equatable {
    public var label: String
    public var name: String
    public var action: String
    public var source: String

    public static let fallback = UpNext(label: "Up next", name: "Start a workout",
      action: "Choose your workout", source: "New session")

    public init(label: String, name: String, action: String, source: String) {
      self.label = label
      self.name = name
      self.action = action
      self.source = source
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      func field(_ key: CodingKeys, _ fallback: String) -> String {
        let value = (try? container.decodeIfPresent(String.self, forKey: key)) ?? nil
        return value.flatMap { $0.isEmpty ? nil : $0 } ?? fallback
      }
      label = field(.label, Self.fallback.label)
      name = field(.name, Self.fallback.name)
      action = field(.action, Self.fallback.action)
      source = field(.source, Self.fallback.source)
    }
  }

  private static let upNextFile = "up-next.json"

  public static func saveUpNext(_ upNext: UpNext) -> Bool {
    access { write(upNext, name: upNextFile, at: $0) } ?? false
  }

  public static func loadUpNext() -> UpNext {
    (access { read(upNextFile, at: $0) as UpNext? } ?? nil) ?? .fallback
  }

  public static func clearUpNext() {
    _ = access { try? FileManager.default.removeItem(at: $0.appendingPathComponent(upNextFile)) }
  }

  public static func postActionDarwinNotification() {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(actionPostedDarwinNotification as CFString), nil, nil, true)
  }
}

#if os(iOS)
@available(iOS 17.0, *)
extension LiveUpdateSharedStore {
  /// Shows the latest stored state on this workout's activity. Every publisher
  /// re-reads the store, so a slower process can't leave an older revision visible.
  /// Always updates rather than trusting the process's cached activity content:
  /// if a display ever diverged, a stale tap would otherwise never repair it.
  public static func publishLatest(workoutId: String) async {
    var published: Int?
    for _ in 0..<3 {
      let state = loadState()
      let activities = Activity<WorkoutActivityAttributes>.activities.filter { $0.attributes.workoutId == workoutId }
      NSLog("[Live Activity] publish workout=%@ activities=%d revision=%d", workoutId, activities.count, state?.revision ?? -1)
      guard let state, state.workoutId == workoutId, !state.finished else {
        for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
        return
      }
      if state.revision == published { return }
      let content = state.content
      for activity in activities {
        await activity.update(ActivityContent(state: content, staleDate: nil))
      }
      published = state.revision
    }
  }
}
#endif
