// Generic "one in-flight run per key" coalescer. Used by src/data/sync.ts so
// overlapping triggers (foreground + connectivity regain + a post-write call
// landing at the same moment) for the same uid collapse into a single sync
// run instead of racing two — the second (and third, ...) caller just gets
// the first call's already-running promise. A different key (a different
// uid, relevant only mid account-switch) runs independently.
export function createKeyedMutex<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return {
    async run(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing;
      const promise = fn().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
    isRunning(key: string): boolean {
      return inFlight.has(key);
    },
  };
}

/**
 * Serial queue: each task runs to completion before the next one starts.
 *
 * Deliberately NOT createKeyedMutex — that one *coalesces*, handing every
 * overlapping caller the first call's promise, so the later callers' work never
 * executes. Correct for "sync again" triggers, silently destructive for writes.
 *
 * Used for SQLite transactions. expo-sqlite's `withTransactionAsync` does not
 * lock the connection, so two overlapping transactions on the same handle put a
 * second BEGIN inside the first and SQLite rejects it with "cannot start a
 * transaction within a transaction" — while each caller's writes still have to
 * land.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn);
    // The chain swallows the rejection so one failed task cannot wedge every
    // task queued behind it; the caller still sees it via the returned promise.
    tail = result.catch(() => {});
    return result;
  };
}
