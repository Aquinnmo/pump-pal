import AsyncStorage from '@react-native-async-storage/async-storage';
import { callAI } from '@/lib/ai-client';

const cacheKey = (date: string) => `pumppal_daily_name_v1_${date}`;

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns today's daily name for the Pushup Challenge prompt.  The last valid
 * response is cached per UTC day, so offline native sessions remain readable
 * without attempting a paid server generation.
 */
export async function getDailyName(): Promise<string> {
  const key = cacheKey(utcDate());
  const cached = await AsyncStorage.getItem(key);
  if (cached) return cached;

  try {
    const { data } = await callAI('daily-name');
    await AsyncStorage.setItem(key, data.name);
    return data.name;
  } catch (e) {
    console.error('getDailyName failed:', e);
    // The challenge remains usable on a first-time offline launch. This is a
    // local UI fallback, not a substituted AI result.
    return 'buddy';
  }
}
