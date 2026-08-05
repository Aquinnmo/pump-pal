import { commit, getDoc } from './rest';
import { todayUTC } from './quota';

/**
 * The `random/{utcDate}` cache for the shared daily name — split out of the
 * op that generates it (`api/_lib/ai/prompts.ts`) so this module does only
 * Firestore, no AI.
 *
 * This runs server-side so that clients no longer need write access to the
 * shared `random` collection — previously any signed-in user could overwrite it.
 */

export async function getCachedDailyName(): Promise<string | undefined> {
  const doc = await getDoc(`random/${todayUTC()}`, ['name']);
  const name = doc?.fields.name;
  return typeof name === 'string' && name ? name : undefined;
}

/**
 * Caches today's generated name. Writes with `currentDocument: { exists: false }`
 * so the first writer wins; a 409 means another instance beat us to it for
 * today, so we re-read and return its value rather than showing two different
 * names for the same globally-shared day.
 */
export async function setCachedDailyName(name: string): Promise<string> {
  const path = `random/${todayUTC()}`;

  try {
    await commit([
      {
        path,
        fields: { name, createdAt: new Date().toISOString() },
        updateMask: ['name', 'createdAt'],
        currentDocument: { exists: false },
      },
    ]);
    return name;
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      const winner = await getCachedDailyName();
      if (winner) return winner;
    }
    throw e;
  }
}
