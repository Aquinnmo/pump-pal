// Local SQLite is a cache the sync engine mutates behind the UI's back, and
// screens load their data on focus (useFocusEffect). A sync that lands rows
// while a screen is *already* focused is therefore invisible until the user
// navigates away and back — which is exactly what happens on first sign-in,
// where Home mounts against an empty DB before the initial sync finishes.
//
// This counter is the "local rows changed" signal. src/data/sync-trigger.ts bumps it
// after a run that actually pulled something; src/hooks/use-data-version.ts turns
// it into a React value so those focus loaders re-run in place.
//
// Deliberately a bare module-level counter rather than a store library: one
// number, one publisher, and React's own useSyncExternalStore does the
// subscription work. Same shape as src/data/initial-sync.ts's gate listeners.
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version++;
  // Copy first: a listener is free to unsubscribe from inside its own callback.
  for (const listener of [...listeners]) listener();
}

export function getDataVersion(): number {
  return version;
}

export function subscribeDataVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
