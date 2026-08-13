// Native reads go through SQLite, so a screen's useFocusEffect loader is cheap
// and every navigation can re-read freely. Web has no local store: the same
// loaders turn into live Firestore round trips, so switching pages visibly
// reloads the account. This is the missing layer — a per-session memo of the
// reads the web repositories perform, cleared whenever one of them writes.
//
// Keys are uid-scoped by their callers, so a second account signing in can
// never read the first one's entry even before the sign-out clear lands.
//
// ponytail: invalidate-on-write only. A change made on another device is
// invisible to an open web session until reload. Upgrade path is
// stale-while-revalidate — serve the cached value, refetch behind it, and
// bumpDataVersion() (src/data/data-version.ts) when the result differs.
export function createReadCache() {
  const entries = new Map<string, Promise<unknown>>();
  return {
    read<T>(key: string, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key) as Promise<T> | undefined;
      if (cached) return cached;
      // A rejection must not be retained: caching it would turn one offline
      // blip into a permanently broken screen for the rest of the session.
      const pending = load().catch((error) => {
        if (entries.get(key) === pending) entries.delete(key);
        throw error;
      });
      entries.set(key, pending);
      return pending;
    },
    clear(): void {
      entries.clear();
    },
  };
}
