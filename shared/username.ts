/**
 * Username format + slug derivation, shared between the server (`api/`) and
 * every client that collects/edits a username (sign-up, set-username,
 * settings rename). No Expo/React Native/Firebase imports — same rule as
 * ai-contract.ts/api-contract.ts, enforced by `npm run test:api-isolation`.
 */

/** Lowercase letter start, 3-20 chars, letters/digits/underscore. */
export const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_REGEX.test(value);
}

/**
 * Turns a display name (or email local-part) into a candidate username: strip
 * to lowercase ascii letters/digits, collapse everything else to underscores,
 * trim leading digits/underscores (the regex requires a leading letter), and
 * fall back to "athlete" if nothing usable survives.
 */
export function slugifyUsername(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 20);
  return slug.length >= 3 ? slug : 'athlete';
}
