export type LiveActivityLatencyTrace = {
  id: string;
  startedAtMs: number;
};

export function logLiveActivityLatency(
  trace: LiveActivityLatencyTrace | undefined,
  phase: string,
  enabled = typeof __DEV__ !== 'undefined' && __DEV__,
): void {
  if (!enabled || !trace) return;
  console.debug(
    `[live-activity-latency] id=${trace.id} phase=${phase} elapsedMs=${Math.round(Date.now() - trace.startedAtMs)}`,
  );
}
