// Local-only row ids (outbox entries, conflict records). Not security
// sensitive, so no new dependency — react-native-get-random-values (already
// a dependency) polyfills crypto.getRandomValues, and Node/Hermes both
// expose crypto.randomUUID where available.
// ponytail: Math.random fallback isn't collision-proof; fine for a
// process-local id that's never compared across devices — upgrade to
// expo-crypto's randomUUID if that ever changes.
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
