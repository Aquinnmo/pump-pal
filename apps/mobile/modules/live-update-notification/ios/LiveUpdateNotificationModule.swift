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
  @Field var latencyTraceId: String? = nil
  @Field var latencyStartedAtMs: Double? = nil
}

public class LiveUpdateNotificationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveUpdateNotification")
    Events("onNotificationAction")
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
    Function("readPendingAction") { Self.pendingJSON() }
    AsyncFunction("acknowledgeAction") { (actionId: String, succeeded: Bool) in
      guard #available(iOS 17.0, *) else { return }
      let posted = await WorkoutActivityLifecycle.shared.settle()
      LiveUpdateSharedStore.acknowledge(actionId, succeeded: succeeded && posted)
    }
    OnCreate { self.observe() }
    OnDestroy { self.stopObserving() }
    OnStartObserving("onNotificationAction") { self.publishPendingAction() }
  }

  private static func isSupported() -> Bool {
    if #available(iOS 17.0, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
    return false
  }

  private static func pendingJSON() -> String? {
    guard let pending = LiveUpdateSharedStore.loadPendingAction(),
          LiveUpdateSharedStore.result(for: pending.actionId) == nil,
          let data = try? JSONEncoder().encode(pending) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func publishPendingAction() {
    Task { @MainActor [weak self] in
      guard let json = Self.pendingJSON() else { return }
      self?.sendEvent("onNotificationAction", ["json": json])
    }
  }

  private func observe() {
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(), { _, observer, _, _, _ in
        guard let observer else { return }
        Unmanaged<LiveUpdateNotificationModule>.fromOpaque(observer).takeUnretainedValue().publishPendingAction()
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
    guard !payload.workoutId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          payload.startedAtMillis.isFinite, payload.startedAtMillis > 0,
          payload.progress >= 0, payload.expectedCompletedSets == payload.progress,
          payload.segments.allSatisfy({ $0.sets >= 0 }),
          payload.actions.allSatisfy({ ["completeSet", "uncompleteSet", "finishWorkout"].contains($0) }) else { return false }
    let segments = payload.segments.map {
      WorkoutActivityAttributes.SegmentState(sets: $0.sets, started: $0.started, completed: $0.completed)
    }
    let total = segments.reduce(0) { $0 + $1.sets }
    guard payload.progress <= total else { return false }
    let state = WorkoutActivityAttributes.ContentState(completedSets: payload.progress, totalSets: total,
      detail: payload.text.isEmpty ? nil : payload.text, segments: segments, actions: payload.actions, title: payload.title)
    let attributes = WorkoutActivityAttributes(workoutId: payload.workoutId, title: payload.title,
      startedAt: Date(timeIntervalSince1970: payload.startedAtMillis / 1000))
    generation += 1
    let version = generation
    let previous = tail
    let operation = Task { @MainActor in
      _ = await previous?.value
      // A newer snapshot supersedes this one; never post stale content or state.
      guard version == self.generation else { return true }
      let activities = Activity<WorkoutActivityAttributes>.activities
      let matching = activities.first { $0.attributes.workoutId == attributes.workoutId && $0.attributes.startedAt == attributes.startedAt }
      for activity in activities where activity.id != matching?.id {
        await activity.end(nil, dismissalPolicy: .immediate)
        guard version == self.generation else { return true }
      }
      do {
        if let activity = matching {
          if activity.content.state != state {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            guard version == self.generation else { return true }
          }
        } else {
          _ = try Activity<WorkoutActivityAttributes>.request(attributes: attributes,
            content: ActivityContent(state: state, staleDate: nil))
        }
        return LiveUpdateSharedStore.saveState(.init(workoutId: attributes.workoutId, content: state))
      } catch {
        NSLog("[Live Activity] request failed: \(error)")
        return false
      }
    }
    tail = operation
    return await operation.value
  }

  func settle() async -> Bool {
    await tail?.value ?? true
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
