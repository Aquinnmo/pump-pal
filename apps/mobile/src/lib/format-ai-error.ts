/**
 * Rendering of unknown thrown values for display.
 *
 * Kept in its own module, free of React Native and Firebase imports, so it can
 * be unit tested under plain Node — `src/lib/ai-client.ts` pulls in `react-native`,
 * whose Flow syntax no Node transform will parse.
 */

/**
 * Where the error happened, not what it was — noise in a one-line rendering.
 * `stack` is V8/Hermes; the other five are JavaScriptCore's source-location
 * fields, which it attaches as non-enumerable own properties to *every* Error.
 * Since the scan below deliberately reads non-enumerable properties, an engine
 * change alone would otherwise add five junk fields to every message.
 */
const STACK_FIELDS = new Set([
  'stack',
  'line',
  'column',
  'sourceURL',
  'originalLine',
  'originalColumn',
]);

/**
 * Best-effort one-line rendering of an unknown thrown value.
 *
 * `String(value)` on a plain object yields "[object Object]" and
 * `JSON.stringify` yields "{}" when the fields are non-enumerable — which is
 * the common case for platform error objects. Both discard the only
 * information worth having. Anything reaching here has already failed; losing
 * the reason to a stringification default is the worse outcome.
 */
export function describeError(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null || typeof value !== 'object') return String(value);

  const obj = value as Record<string, unknown>;
  const name =
    (value instanceof Error && value.name) ||
    (typeof obj.constructor === 'function' && obj.constructor.name) ||
    'Object';

  if (typeof obj.message === 'string' && obj.message) {
    // A `code` is the more diagnostic half when both are present — this is the
    // shape of Vercel platform errors ({ code: 'NOT_FOUND', message: ... }) and
    // of FirebaseError.
    const prefix =
      typeof obj.code === 'string' && obj.code
        ? obj.code
        : value instanceof Error
          ? null
          : name;
    return prefix ? `${prefix}: ${obj.message}` : obj.message;
  }
  if (typeof obj.error === 'string' && obj.error) return obj.error;

  const fields: string[] = [];
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (STACK_FIELDS.has(key)) continue;
    let rendered: string;
    try {
      const field = obj[key];
      if (typeof field === 'function') continue;
      // Depth-1 only: a nested object renders as its constructor name rather
      // than recursing, which keeps cyclic structures from looping.
      rendered =
        field !== null && typeof field === 'object'
          ? ((field as { constructor?: { name?: string } }).constructor?.name ?? 'Object')
          : String(field);
    } catch {
      rendered = '<unreadable>';
    }
    fields.push(`${key}=${rendered}`);
  }

  return fields.length > 0 ? `${name}(${fields.join(', ')})` : name;
}

/**
 * Formats an error from `callAI` for display. The proxy already sanitizes
 * provider responses, so this only has to unwrap whatever shape arrived.
 */
export function formatAIError(error: unknown): string {
  return describeError(error);
}
