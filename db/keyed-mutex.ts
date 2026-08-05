// Generic "one in-flight run per key" coalescer. Used by db/sync.ts so
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
