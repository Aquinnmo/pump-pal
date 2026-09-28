import ActivityKit
import ExpoModulesCore
import Foundation

struct LiveUpdateSegmentRecord: Record {
  @Field var sets: Int = 0
  @Field var started: Bool = false
  @Field var completed: Bool = false
}

struct LiveUpdateNotificationPayloadRecord: Record {
  @Field var workoutId: String = ""
  @Field var expectedCompletedSets: Int = -1
  @Field var title: String = ""
  @Field var text: String = ""
  @Field var startedAtMillis: Double = 0
  @Field var shortCriticalText: String = ""
  @Field var progress: Int = 0
  @Field var segments: [LiveUpdateSegmentRecord] = []
  @Field var actions: [String] = []
  @Field var setDetails: [String] = []
  @Field var setCompleted: [Bool] = []
  @Field var latencyTraceId: String? = nil
  @Field var latencyStartedAtMs: Double? = nil
}

public class LiveUpdateNotificationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveUpdateNotification")
    Events("onNotificationAction", "onJournalChanged")
    Function("isSupported") { Self.isSupported() }
    // Keep the shared synchronous bridge compatible with Android and old callers.
    Function("show") { (payload: LiveUpdateNotificationPayloadRecord) -> Bool in
      guard Self.isSupported() else { return false }
      Task { @MainActor in
        if #available(iOS 17.0, *) { _ = await WorkoutActivityLifecycle.shared.show(payload) }
      }
      return true
    }
    AsyncFunction("showAsync") { (payload: LiveUpdateNotificationPayloadRecord) -> Bool in
      guard #available(iOS 17.0, *), Self.isSupported() else { return false }
      return await WorkoutActivityLifecycle.shared.show(payload)
    }
    Function("dismiss") {
      Task { @MainActor in
        if #available(iOS 17.0, *) { await WorkoutActivityLifecycle.shared.dismiss() }
      }
    }
    AsyncFunction("dismissAsync") {
      if #available(iOS 17.0, *) { await WorkoutActivityLifecycle.shared.dismiss() }
    }
    Function("readJournal") { () -> String in
      let data = try? JSONEncoder().encode(LiveUpdateSharedStore.loadJournal())
      return data.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }
    AsyncFunction("acknowledgeJournal") { (ids: [String]) -> Bool in
      LiveUpdateSharedStore.acknowledge(ids)
    }
    OnCreate { self.observe() }
    OnDestroy { self.stopObserving() }
    OnStartObserving("onJournalChanged") { self.publishJournalChanged() }
  }

  private static func isSupported() -> Bool {
    if #available(iOS 17.0, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
    return false
  }

  private func publishJournalChanged() {
    Task { @MainActor [weak self] in
      guard !LiveUpdateSharedStore.loadJournal().isEmpty else { return }
      self?.sendEvent("onJournalChanged", [:])
    }
  }

  private func observe() {
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(), { _, observer, _, _, _ in
        guard let observer else { return }
        Unmanaged<LiveUpdateNotificationModule>.fromOpaque(observer).takeUnretainedValue().publishJournalChanged()
      }, LiveUpdateSharedStore.actionPostedDarwinNotification as CFString, nil, .deliverImmediately)
  }

  private func stopObserving() {
    CFNotificationCenterRemoveObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(LiveUpdateSharedStore.actionPostedDarwinNotification as CFString), nil)
  }
}

@available(iOS 17.0, *)
@MainActor
private final class WorkoutActivityLifecycle {
  static let shared = WorkoutActivityLifecycle()
  private var generation = 0
  private var tail: Task<Bool, Never>?

  func show(_ payload: LiveUpdateNotificationPayloadRecord) async -> Bool {
    LiveUpdateSharedStore.logLatency(payload.latencyTraceId, phase: "native.show.entry", startedAtMs: payload.latencyStartedAtMs)
    let startedAt = Date(timeIntervalSince1970: payload.startedAtMillis / 1000)
    guard !payload.workoutId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          payload.startedAtMillis.isFinite, payload.startedAtMillis > 0,
          payload.setDetails.count == payload.setCompleted.count,
          let state = LiveUpdateSharedStore.StoredState(
            workoutId: payload.workoutId,
            title: payload.title, startedAt: startedAt, rowSetCounts: payload.segments.map(\.sets),
            sets: zip(payload.setCompleted, payload.setDetails).map { .init(completed: $0, detail: $1) }),
          // JS and native derive the same presentation; a mismatch is a parity bug.
          state.content.completedSets == payload.progress, payload.expectedCompletedSets == payload.progress,
          state.content.actions == payload.actions else { return false }
    let attributes = WorkoutActivityAttributes(workoutId: payload.workoutId, title: payload.title, startedAt: startedAt)
    generation += 1
    let version = generation
    let previous = tail
    let operation = Task { @MainActor in
      _ = await previous?.value
      // A newer snapshot supersedes this one; never post stale content or state.
      guard version == self.generation else { return true }
      switch LiveUpdateSharedStore.replace(with: state) {
      case .failed: return false
      case .deferred: return true // JS replays native taps first, then republishes.
      case .saved: break
      }
      let activities = Activity<WorkoutActivityAttributes>.activities
      let matching = activities.first { $0.attributes.workoutId == attributes.workoutId && $0.attributes.startedAt == attributes.startedAt }
      for activity in activities where activity.id != matching?.id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      guard version == self.generation else { return true }
      if matching == nil {
        do {
          _ = try Activity<WorkoutActivityAttributes>.request(attributes: attributes,
            content: ActivityContent(state: state.content, staleDate: nil))
        } catch {
          NSLog("[Live Activity] request failed: \(error)")
          return false
        }
      } else {
        await LiveUpdateSharedStore.publishLatest(workoutId: attributes.workoutId)
      }
      LiveUpdateSharedStore.logLatency(payload.latencyTraceId, phase: "native.show.return", startedAtMs: payload.latencyStartedAtMs)
      return true
    }
    tail = operation
    return await operation.value
  }

  func dismiss() async {
    generation += 1
    let version = generation
    let previous = tail
    let operation = Task { @MainActor in
      _ = await previous?.value
      guard version == self.generation else { return true }
      LiveUpdateSharedStore.clearState()
      for activity in Activity<WorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
        guard version == self.generation else { return true }
      }
      return true
    }
    tail = operation
    _ = await operation.value
  }
}
