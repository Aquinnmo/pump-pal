// Unique ids for local rows, draft rows and sessions. No new dependency —
// react-native-get-random-values (already a dependency, imported for its side
// effect at the top of app/_layout.tsx) polyfills crypto.getRandomValues on
// Hermes, and web/Node expose crypto.randomUUID directly.
//
// Math.random is deliberately not a fallback here: it is not a CSPRNG, and
// CodeQL's js/insecure-randomness flags every id derived from it.
export function randomId(prefix?: string): string {
  const c = globalThis.crypto;
  const body = c.randomUUID
    ? c.randomUUID()
    : Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
  return prefix ? `${prefix}_${body}` : body;
}
