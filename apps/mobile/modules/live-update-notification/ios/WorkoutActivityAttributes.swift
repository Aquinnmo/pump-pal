import ActivityKit
import Foundation

// Swift mirror of utils/workout-notification-model.ts's WorkoutNotificationPresentation.
// This is the only place JS -> native domain shape translation happens; nothing else
// on the native side should re-derive workout copy/segment logic.
//
// NOTE: this file is intentionally duplicated (byte-for-byte) at
// targets/widget/WorkoutActivityAttributes.swift. The Expo module target (CocoaPods)
// and the widget-extension target (added by @bacons/apple-targets) are separate build
// units that can't easily share a single Swift source file across two different native
// build systems, so both copies must be kept in sync by hand when this shape changes.
public struct WorkoutActivityAttributes: ActivityAttributes {
  public struct SegmentState: Codable, Hashable, Sendable {
    public var sets: Int
    public var started: Bool
    public var completed: Bool

    public init(sets: Int, started: Bool, completed: Bool) {
      self.sets = sets
      self.started = started
      self.completed = completed
    }
  }

  public struct ContentState: Codable, Hashable, Sendable {
    public var title: String?
    public var completedSets: Int
    public var totalSets: Int
    public var detail: String?
    public var segments: [SegmentState]
    public var actions: [String] // 'completeSet' | 'uncompleteSet' | 'finishWorkout'
    // completedSets/totalSets are what's shown and count sets — a drop set is one.
    // completedParts counts every ticked part, drops included; it is the stale-tap
    // guard intents carry, since it moves on every tap. Optional so a state encoded
    // by an older build still decodes; nil means parts == sets.
    public var completedParts: Int?

    public init(completedSets: Int, totalSets: Int, detail: String?, segments: [SegmentState], actions: [String], title: String? = nil, completedParts: Int? = nil) {
      self.title = title
      self.completedParts = completedParts
      self.completedSets = completedSets
      self.totalSets = totalSets
      self.detail = detail
      self.segments = segments
      self.actions = actions
    }
  }

  public var workoutId: String
  public var title: String
  public var startedAt: Date

  public init(workoutId: String, title: String, startedAt: Date) {
    self.workoutId = workoutId
    self.title = title
    self.startedAt = startedAt
  }
}
