import ActivityKit
import ExpoModulesCore

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
    if #available(iOS 16.1, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    return false
  }

  @available(iOS 16.1, *)
  private var currentActivity: Activity<WorkoutActivityAttributes>? {
    Activity<WorkoutActivityAttributes>.activities.first
  }

  private func show(_ payload: LiveUpdateNotificationPayloadRecord) -> Bool {
    guard #available(iOS 16.1, *), isSupported() else { return false }

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

    do {
      if let activity = currentActivity {
        Task { await activity.update(ActivityContent(state: contentState, staleDate: nil)) }
      } else {
        let attributes = WorkoutActivityAttributes(
          workoutId: payload.workoutId,
          title: payload.title,
          startedAt: Date(timeIntervalSince1970: payload.startedAtMillis / 1000)
        )
        _ = try Activity<WorkoutActivityAttributes>.request(
          attributes: attributes,
          content: ActivityContent(state: contentState, staleDate: nil)
        )
      }
      return true
    } catch {
      NSLog("[\(TAG)] show() failed: \(error)")
      return false
    }
  }

  private func dismiss() {
    guard #available(iOS 16.1, *) else { return }
    LiveUpdateSharedStore.clearState()
    Task {
      for activity in Activity<WorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
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
    guard let pending = LiveUpdateSharedStore.drainPendingAction(),
          let json = Self.jsonString(from: pending) else { return }
    sendEvent("onNotificationAction", ["json": json])
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
