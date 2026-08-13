/**
 * Username format + slug derivation, shared between the server (`api/`) and
 * every client that collects/edits a username (sign-up, set-username,
 * settings rename). No Expo/React Native/Firebase imports — same rule as
 * ai-contract.ts/api-contract.ts, enforced by `npm run test:api-isolation`.
 */

/**
 * Letter start (either case), 3-20 chars, letters/digits/underscore.
 * Case is preserved for display; uniqueness is enforced separately via the
 * lowercase `usernameLower` field / `usernames/{usernameLower}` doc key.
 */
export const USERNAME_REGEX = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

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
  const collapsed = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '');

  let end = collapsed.length;
  while (end > 0 && collapsed[end - 1] === '_') end -= 1;

  const slug = collapsed.slice(0, end).slice(0, 20);
  return slug.length >= 3 ? slug : 'athlete';
}
