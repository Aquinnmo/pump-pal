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
let state = WorkoutActivityAttributes.ContentState(completedSets: 1, totalSets: 3,
  detail: "Bench · 8 reps", segments: [.init(sets: 3, started: true, completed: false)],
  actions: ["completeSet", "uncompleteSet"], title: "Logging Push Workout")
assert(LiveUpdateSharedStore.saveState(.init(workoutId: "w1", content: state)))
assert(LiveUpdateSharedStore.loadState()?.content == state)
func tap(_ workoutId: String = "w1", age: Double = 0) -> LiveUpdateSharedStore.PendingAction {
  .init(actionId: UUID().uuidString, action: "completeSet", workoutId: workoutId,
    expectedCompletedSets: 1, createdAt: Date(timeIntervalSinceNow: -age))
}
let first = tap()
assert(LiveUpdateSharedStore.enqueue(first))
assert(!LiveUpdateSharedStore.enqueue(tap()), "a busy slot must never silently lose a tap")
assert(LiveUpdateSharedStore.loadPendingAction()?.actionId == first.actionId)
LiveUpdateSharedStore.acknowledge(UUID().uuidString, succeeded: true)
assert(LiveUpdateSharedStore.loadPendingAction()?.actionId == first.actionId)
LiveUpdateSharedStore.acknowledge(first.actionId, succeeded: true)
assert(LiveUpdateSharedStore.loadPendingAction() == nil)
let next = tap()
assert(LiveUpdateSharedStore.enqueue(next))
LiveUpdateSharedStore.acknowledge(next.actionId, succeeded: false)
assert(LiveUpdateSharedStore.result(for: first.actionId)?.succeeded == true)
assert(LiveUpdateSharedStore.result(for: next.actionId)?.succeeded == false)
LiveUpdateSharedStore.release(first.actionId)
assert(LiveUpdateSharedStore.result(for: first.actionId) == nil)
assert(LiveUpdateSharedStore.result(for: next.actionId)?.succeeded == false)
assert(LiveUpdateSharedStore.enqueue(tap(age: 60)))
assert(LiveUpdateSharedStore.enqueue(tap()), "expired handoff must not wedge later actions")
let other = tap("w2")
assert(LiveUpdateSharedStore.enqueue(other), "a new workout must not be blocked by an ended session")
LiveUpdateSharedStore.clearState()
assert(LiveUpdateSharedStore.loadState() == nil)
assert(LiveUpdateSharedStore.loadPendingAction()?.actionId == other.actionId,
  "dismissal must not destroy an intent's unacknowledged action")
LiveUpdateSharedStore.acknowledge(other.actionId, succeeded: false)
let lock = NSLock()
var claims = 0
DispatchQueue.concurrentPerform(iterations: 8) { _ in
  if LiveUpdateSharedStore.enqueue(tap()) {
    lock.lock(); claims += 1; lock.unlock()
  }
}
assert(claims == 1, "concurrent intent claims must serialize")
print("iOS Live Activity durable handoff checks passed")
`;
  const harness = join(directory, 'check.swift');
  writeFileSync(harness, attributes + '\n' + store + '\n' + checks);
  process.stdout.write(execFileSync('xcrun', ['swift', '-module-cache-path', join(directory, 'cache'), harness], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
