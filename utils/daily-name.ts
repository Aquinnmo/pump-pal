import { callAI } from '@/utils/ai-client';

/**
 * Returns today's daily name for the "Swipe left if you lied" prompt.
 *
 * The read/generate/cache cycle against Firestore `random/{utcDate}` now runs
 * inside the `/api/ai` function. That keeps the provider key off the device and
 * lets the security rules deny clients write access to the shared `random`
 * collection, which any signed-in user could previously overwrite.
 */
export async function getDailyName(): Promise<string> {
  try {
    const { data } = await callAI('daily-name');
    return data.name;
  } catch (e) {
    console.error('getDailyName failed:', e);
    // Fallback so the UI still renders something sensible
    return 'buddy';
  }
}
