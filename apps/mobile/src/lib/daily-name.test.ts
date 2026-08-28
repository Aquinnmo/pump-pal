import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mock } from 'bun:test';

let generatedName = 'Generated name';
let generationError: unknown = null;
let generationCalls = 0;

mock.module('@/lib/ai-client', () => ({
  callAI: async () => {
    generationCalls += 1;
    if (generationError) throw generationError;
    return { data: { name: generatedName } };
  },
}));

const { getDailyName } = await import('./daily-name');

const RealDate = Date;

async function withFrozenNow<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  const frozenMilliseconds = RealDate.parse(iso);
  class FrozenDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) super(frozenMilliseconds);
      else if (value instanceof RealDate) super(value.getTime());
      else super(value);
    }

    static now(): number {
      return frozenMilliseconds;
    }
  }

  const globals = globalThis as typeof globalThis & { Date: DateConstructor };
  const previousDate = globals.Date;
  globals.Date = FrozenDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globals.Date = previousDate;
  }
}

const cacheKeys = [
  'pumppal_daily_name_v1_2026-08-27',
  'pumppal_daily_name_v1_2026-08-28',
  'pumppal_daily_name_v1_2020-01-01',
];

async function resetCache(): Promise<void> {
  // Other top-level mobile tests may replace the shared AsyncStorage double
  // with one that intentionally exposes only get/set/remove.
  await Promise.all(cacheKeys.map((key) => AsyncStorage.removeItem(key)));
}

await resetCache();

// Cache entries are keyed by the UTC calendar day. A hit on one UTC day is
// reused, while crossing midnight asks AI for the new day's name.
generationCalls = 0;
generatedName = 'Tomorrow name';
await AsyncStorage.setItem('pumppal_daily_name_v1_2026-08-27', 'Cached name');
assert.equal(
  await withFrozenNow('2026-08-27T23:30:00.000Z', getDailyName),
  'Cached name',
);
assert.equal(generationCalls, 0, 'a cached name for the UTC day avoids generation');

assert.equal(
  await withFrozenNow('2026-08-28T00:30:00.000Z', getDailyName),
  'Tomorrow name',
);
assert.equal(generationCalls, 1, 'a new UTC day gets a new name');
assert.equal(await AsyncStorage.getItem('pumppal_daily_name_v1_2026-08-28'), 'Tomorrow name');

// A cached empty string is falsy, so it is a cache miss and is replaced by a
// fresh result.
await resetCache();
generationCalls = 0;
generatedName = 'Refetched name';
await AsyncStorage.setItem('pumppal_daily_name_v1_2026-08-27', '');
assert.equal(
  await withFrozenNow('2026-08-27T12:00:00.000Z', getDailyName),
  'Refetched name',
);
assert.equal(generationCalls, 1, 'an empty cached value refetches');

// Generation errors leave the challenge usable with the local fallback.
await resetCache();
generationError = new Error('offline');
assert.equal(await withFrozenNow('2026-08-27T12:00:00.000Z', getDailyName), 'buddy');
generationError = null;

// A successful request does not prune entries from prior days.
await resetCache();
const oldKey = 'pumppal_daily_name_v1_2020-01-01';
await AsyncStorage.setItem(oldKey, 'Old name');
generatedName = 'Current name';
await withFrozenNow('2026-08-27T12:00:00.000Z', getDailyName);
assert.equal(await AsyncStorage.getItem(oldKey), 'Old name', 'old cache entries are retained');

console.log('daily-name: all assertions passed');
