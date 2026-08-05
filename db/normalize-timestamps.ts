// Converts every Firestore-Timestamp-shaped value inside an object graph to
// an ISO 8601 string, recursively. Used by every local repository before a
// JSON payload is written to a `data` column, so nothing in db/* ever
// imports `firebase/firestore` — a plain duck-typed shape check does the
// same job without the dependency (matches the app-wide goal of removing
// runtime Firestore imports, see CLAUDE.md).
//
// Handles three input shapes uniformly, per docs/data-model conventions
// (e.g. Workout.date, Injury.onsetDate):
//   - a real Firestore `Timestamp` instance (duck-typed via its `seconds`/
//     `nanoseconds` getters — reading `.seconds` off the instance works
//     without importing the class)
//   - a plain `{ seconds, nanoseconds }` object (migrated/legacy data)
//   - a `Date`
// ISO strings pass through unchanged, so re-normalizing already-local or
// future API wire data (ISO strings) is a safe no-op.

type TimestampLike = { seconds: number; nanoseconds: number };

function isTimestampLike(value: unknown): value is TimestampLike {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.seconds === 'number' && typeof v.nanoseconds === 'number';
}

export function toIsoString(value: TimestampLike | Date | string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(value.seconds * 1000 + Math.round(value.nanoseconds / 1e6)).toISOString();
}

export function normalizeTimestampsDeep<T>(value: T): T {
  if (isTimestampLike(value)) {
    return toIsoString(value) as unknown as T;
  }
  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalizeTimestampsDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeTimestampsDeep(v);
    }
    return out as T;
  }
  return value;
}
