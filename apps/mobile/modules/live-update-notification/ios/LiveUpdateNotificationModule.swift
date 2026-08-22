import ActivityKit
import ExpoModulesCore
import Foundation

private let TAG = "LiveUpdateNotification"

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
}

public class LiveUpdateNotificationModule: Module {
  private let activityGenerationLock = NSLock()
  private var activityGeneration: UInt64 = 0

  public func definition() -> ModuleDefinition {
    Name("LiveUpdateNotification")

    Events("onNotificationAction")

    Function("isSupported") {
      isSupported()
    }

    Function("show") { (payload: LiveUpdateNotificationPayloadRecord) -> Bool in
      show(payload)
    }

    Function("dismiss") {
      dismiss()
    }

    Function("drainPendingAction") { () -> String? in
      drainPendingAction()
    }

    OnCreate {
      startObservingActions()
    }

    OnDestroy {
      stopObservingActions()
    }
  }

  private func isSupported() -> Bool {
    if #available(iOS 17.0, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    return false
  }

  private func beginActivityOperation() -> UInt64 {
    activityGenerationLock.lock()
    defer { activityGenerationLock.unlock() }
    activityGeneration &+= 1
    return activityGeneration
  }

  private func isCurrentActivityOperation(_ generation: UInt64) -> Bool {
    activityGenerationLock.lock()
    defer { activityGenerationLock.unlock() }
    return activityGeneration == generation
  }

  private func show(_ payload: LiveUpdateNotificationPayloadRecord) -> Bool {
    guard #available(iOS 17.0, *), isSupported() else { return false }
    let generation = beginActivityOperation()

    let segments = payload.segments.map {
      WorkoutActivityAttributes.SegmentState(sets: $0.sets, started: $0.started, completed: $0.completed)
    }
    let contentState = WorkoutActivityAttributes.ContentState(
      completedSets: payload.progress,
      totalSets: segments.reduce(0) { $0 + $1.sets },
      detail: payload.text.isEmpty ? nil : payload.text,
      segments: segments,
      actions: payload.actions
    )

    LiveUpdateSharedStore.saveState(
      LiveUpdateSharedStore.StoredState(
        workoutId: payload.workoutId,
        completedSets: contentState.completedSets,
        totalSets: contentState.totalSets,
        detail: contentState.detail,
        segments: segments,
        actions: payload.actions
      )
    )

    let attributes = WorkoutActivityAttributes(
      workoutId: payload.workoutId,
      title: payload.title,
      startedAt: Date(timeIntervalSince1970: payload.startedAtMillis / 1000)
    )

    // ActivityKit updates and endings are isolated to the main actor. Re-check after
    // every suspension so an older redraw cannot resume and overwrite a newer one.
    Task { @MainActor [weak self] in
      await self?.synchronizeActivity(
        attributes: attributes,
        contentState: contentState,
        generation: generation
      )
    }
    return true
  }

  private func dismiss() {
    guard #available(iOS 17.0, *) else { return }
    let generation = beginActivityOperation()
    LiveUpdateSharedStore.clearState()
    LiveUpdateSharedStore.clearPendingAction()
    Task { @MainActor in
      await endActivities(generation: generation)
    }
  }

  @available(iOS 17.0, *)
  @MainActor
  private func synchronizeActivity(
    attributes: WorkoutActivityAttributes,
    contentState: WorkoutActivityAttributes.ContentState,
    generation: UInt64
  ) async {
    guard isCurrentActivityOperation(generation) else { return }
    let allActivities = Activity<WorkoutActivityAttributes>.activities
    for activity in allActivities where activity.attributes.workoutId != attributes.workoutId {
      guard isCurrentActivityOperation(generation) else { return }
      await activity.end(nil, dismissalPolicy: .immediate)
      guard isCurrentActivityOperation(generation) else { return }
    }

    guard isCurrentActivityOperation(generation) else { return }
    let matching = Activity<WorkoutActivityAttributes>.activities.filter {
      $0.attributes.workoutId == attributes.workoutId
    }
    if let activity = matching.first {
      for duplicate in matching.dropFirst() {
        guard isCurrentActivityOperation(generation) else { return }
        await duplicate.end(nil, dismissalPolicy: .immediate)
        guard isCurrentActivityOperation(generation) else { return }
      }
      guard isCurrentActivityOperation(generation) else { return }
      await activity.update(ActivityContent(state: contentState, staleDate: nil))
      return
    }

    guard isCurrentActivityOperation(generation) else { return }
    do {
      _ = try Activity<WorkoutActivityAttributes>.request(
        attributes: attributes,
        content: ActivityContent(state: contentState, staleDate: nil)
      )
    } catch {
      NSLog("[\(TAG)] show() failed: \(error)")
    }
  }

  @available(iOS 17.0, *)
  @MainActor
  private func endActivities(generation: UInt64) async {
    for activity in Activity<WorkoutActivityAttributes>.activities {
      guard isCurrentActivityOperation(generation) else { return }
      await activity.end(nil, dismissalPolicy: .immediate)
      guard isCurrentActivityOperation(generation) else { return }
    }
  }

  private func drainPendingAction() -> String? {
    guard let pending = LiveUpdateSharedStore.drainPendingAction() else { return nil }
    return Self.jsonString(from: pending)
  }

  private func startObservingActions() {
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let module = Unmanaged<LiveUpdateNotificationModule>.fromOpaque(observer).takeUnretainedValue()
        module.onActionPosted()
      },
      LiveUpdateSharedStore.actionPostedDarwinNotification as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func stopObservingActions() {
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(LiveUpdateSharedStore.actionPostedDarwinNotification as CFString),
      nil
    )
  }

  private func onActionPosted() {
    // Darwin notifications can arrive on a non-main thread. Expo event delivery
    // must happen on the main actor, and draining there also keeps delivery ordered
    // with the host's foreground lifecycle.
    Task { @MainActor [weak self] in
      guard let self,
            let pending = LiveUpdateSharedStore.drainPendingAction(),
            let json = Self.jsonString(from: pending) else { return }
      self.sendEvent("onNotificationAction", ["json": json])
    }
  }

  private static func jsonString(from action: LiveUpdateSharedStore.PendingAction) -> String? {
    let dict: [String: Any] = [
      "action": action.action,
      "workoutId": action.workoutId,
      "expectedCompletedSets": action.expectedCompletedSets,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
