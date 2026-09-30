/**
 * Deterministic doc id for a pair, so the same two users always collide on
 * one document no matter who asks first. That collision IS the uniqueness
 * guarantee — a request create uses `{ exists: false }` against this id.
 *
 * Each uid is escaped (`_` -> `__`) before joining on a single `_`, so the
 * join is injective: every underscore run inside an escaped token is
 * even-length, so the lone odd-length run is unambiguously the separator.
 * Without the escaping, `pairId('a_b', 'c')` and `pairId('a', 'b_c')` would
 * both produce `a_b_c`.
 */
export function pairId(a: string, b: string): string {
  return [a, b].sort().map((u) => u.replaceAll('_', '__')).join('_');
}
