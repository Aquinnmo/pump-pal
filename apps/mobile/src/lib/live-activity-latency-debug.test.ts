import assert from 'node:assert/strict';

import { logLiveActivityLatency } from '@/lib/live-activity-latency-debug';
import { parseLiveUpdateNotificationAction } from '@/lib/workout-action';

const trace = { id: 'trace-1', startedAtMs: Date.now() - 20 };
const actionJson = JSON.stringify({
  action: 'completeSet',
  workoutId: 'workout-1',
  expectedCompletedSets: 0,
  latencyTraceId: trace.id,
  latencyStartedAtMs: trace.startedAtMs,
});
const parsed = parseLiveUpdateNotificationAction(actionJson);
assert.deepEqual(parsed, {
  action: 'completeSet',
  workoutId: 'workout-1',
  expectedCompletedSets: 0,
  latencyTrace: trace,
});
assert.deepEqual(
  parseLiveUpdateNotificationAction('{"action":"completeSet","workoutId":"w1","expectedCompletedSets":0}'),
  { action: 'completeSet', workoutId: 'w1', expectedCompletedSets: 0 },
);

const originalDebug = console.debug;
const logs: string[] = [];
console.debug = (message?: unknown) => logs.push(String(message));
try {
  logLiveActivityLatency(trace, 'js.event', false);
  assert.equal(logs.length, 0, 'production gate emits no log');
  logLiveActivityLatency(parsed?.latencyTrace, 'js.event', true);
  logLiveActivityLatency(parsed?.latencyTrace, 'js.handler.start', true);
} finally {
  console.debug = originalDebug;
}
assert.equal(logs.length, 2);
assert.ok(logs.every((line) => line.includes('id=trace-1')));
assert.ok(logs.every((line) => line.includes('elapsedMs=')));
assert.ok(logs[0].includes('phase=js.event'));
assert.ok(logs[1].includes('phase=js.handler.start'));

console.log('live-activity-latency-debug: ok');
