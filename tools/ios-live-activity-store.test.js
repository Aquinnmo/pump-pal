// Run with: node tools/ios-live-activity-store.test.js (macOS + Xcode toolchain).
// Exercise the real coordinated store against a temporary container; only the
// entitled App Group URL is replaced at the platform boundary.
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'timber-live-store-'));
try {
  const attributes = readFileSync(join(root, 'apps/mobile/targets/widget/WorkoutActivityAttributes.swift'), 'utf8')
    .replace('import ActivityKit', '')
    .replace(': ActivityAttributes', ': Codable');
  const store = readFileSync(join(root, 'apps/mobile/targets/widget/LiveUpdateSharedStore.swift'), 'utf8')
    .replace('FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)',
      `Optional(URL(fileURLWithPath: ${JSON.stringify(directory)}))`);
  const checks = `
typealias Store = LiveUpdateSharedStore
func workout(_ completed: [Bool], rows: [Int]? = nil, id: String = "w1") -> Store.StoredState {
  Store.StoredState(workoutId: id, title: "Logging Push Workout", startedAt: Date(timeIntervalSince1970: 1),
    rowSetCounts: rows ?? [completed.count], sets: completed.enumerated().map { .init(completed: $1, detail: "Set \\($0)") })!
}
assert(Store.StoredState(workoutId: "w1", title: "", startedAt: Date(), rowSetCounts: [2], sets: []) == nil,
  "row counts must describe exactly the stored sets")

// Presentation parity with buildWorkoutNotificationPresentation.
assert(workout([]).content.actions == [])
assert(workout([false, false]).content.actions == ["completeSet"])
assert(workout([false, false]).content.detail == "Set 0")
let gap = workout([true, false, true, false], rows: [2, 2, 0]).content
assert(gap.completedSets == 2 && gap.totalSets == 4 && gap.detail == "Set 3", "the cursor follows the last completed set")
assert(gap.actions == ["completeSet", "uncompleteSet"])
assert(gap.segments == [.init(sets: 2, started: true, completed: false), .init(sets: 2, started: true, completed: false),
  .init(sets: 0, started: false, completed: false)])
let done = workout([true, true]).content
assert(done.actions == ["finishWorkout", "uncompleteSet"] && done.detail == nil)

// Native commits: validate, apply, journal. Stale taps never write.
assert(Store.replace(with: workout([false, false])) == .saved)
assert(Store.commit("uncompleteSet", workoutId: "w1", expectedCompletedSets: 0) == nil, "unavailable action")
let first = Store.commit("completeSet", workoutId: "w1", expectedCompletedSets: 0)!
assert(Store.commit("completeSet", workoutId: "w1", expectedCompletedSets: 0) == nil, "a stale tap must not apply twice")
assert(Store.commit("completeSet", workoutId: "w2", expectedCompletedSets: 1) == nil, "another workout's tap")
let second = Store.commit("completeSet", workoutId: "w1", expectedCompletedSets: 1)!
assert(Store.loadState()!.content.actions == ["finishWorkout", "uncompleteSet"])
let undo = Store.commit("uncompleteSet", workoutId: "w1", expectedCompletedSets: 2)!
assert(Store.loadState()!.sets.map(\\.completed) == [true, false])
assert(Store.loadJournal().map(\\.id) == [first.id, second.id, undo.id])
assert(Store.loadJournal().map(\\.action) == ["completeSet", "completeSet", "uncompleteSet"])

// The app's presentation must not overwrite native taps it has not replayed.
assert(Store.replace(with: workout([false, false])) == .deferred)
assert(Store.loadState()!.sets.map(\\.completed) == [true, false])
assert(Store.replace(with: workout([false], id: "w2")) == .saved, "another workout is not blocked")
assert(Store.acknowledge([first.id, second.id, undo.id]))
assert(Store.loadJournal().isEmpty)
assert(Store.replace(with: workout([true, true])) == .saved)
let revision = Store.loadState()!.revision

// Finish ends controls, survives dismissal, and blocks later taps.
let finish = Store.commit("finishWorkout", workoutId: "w1", expectedCompletedSets: 2)!
assert(Store.loadState()!.finished && Store.loadState()!.content.actions.isEmpty)
assert(Store.loadState()!.revision == revision + 1)
assert(Store.commit("uncompleteSet", workoutId: "w1", expectedCompletedSets: 2) == nil)
Store.clearState()
assert(Store.loadState() == nil)
assert(Store.loadJournal() == [finish], "dismissal must not lose a queued Finish")
assert(Store.commit("completeSet", workoutId: "w1", expectedCompletedSets: 0) == nil)

// Concurrent taps from two processes serialize: exactly one applies.
assert(Store.acknowledge([finish.id]))
assert(Store.replace(with: workout([false, false, false])) == .saved)
let lock = NSLock()
var applied = 0
DispatchQueue.concurrentPerform(iterations: 8) { _ in
  if Store.commit("completeSet", workoutId: "w1", expectedCompletedSets: 0) != nil {
    lock.lock(); applied += 1; lock.unlock()
  }
}
assert(applied == 1 && Store.loadState()!.content.completedSets == 1, "concurrent taps must serialize")
print("iOS Live Activity native commit checks passed")
`;
  const harness = join(directory, 'check.swift');
  writeFileSync(harness, attributes + '\n' + store + '\n' + checks);
  process.stdout.write(execFileSync('xcrun', ['swift', '-module-cache-path', join(directory, 'cache'), harness], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
