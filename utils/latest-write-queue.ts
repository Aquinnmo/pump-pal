export type LatestWriteQueue<T> = {
  schedule(value: T): Promise<void>;
  flush(value?: T): Promise<void>;
  hasPending(): boolean;
};

/**
 * Serializes writes while retaining only the newest snapshot that has not
 * started yet. A failed write remains pending, so the next schedule/flush is
 * a real retry instead of silently declaring the snapshot saved.
 */
export function createLatestWriteQueue<T>(write: (value: T) => Promise<void>): LatestWriteQueue<T> {
  let latest: { value: T; version: number } | null = null;
  let nextVersion = 0;
  let writtenVersion = 0;
  let running: Promise<void> | null = null;

  const drain = (): Promise<void> => {
    if (running) return running;

    const task = (async () => {
      while (latest && writtenVersion < latest.version) {
        const target = latest;
        await write(target.value);
        writtenVersion = target.version;
      }
    })();

    running = task.finally(() => {
      running = null;
    });
    return running;
  };

  const schedule = (value: T): Promise<void> => {
    latest = { value, version: ++nextVersion };
    return drain();
  };

  const flush = async (value?: T): Promise<void> => {
    if (value !== undefined) schedule(value).catch(() => {});
    const targetVersion = latest?.version ?? writtenVersion;

    while (writtenVersion < targetVersion) {
      await drain();
    }
  };

  return {
    schedule,
    flush,
    hasPending: () => !!latest && writtenVersion < latest.version,
  };
}
