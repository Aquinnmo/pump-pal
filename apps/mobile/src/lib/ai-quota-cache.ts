import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Last known AI credit balance, cached locally.
 *
 * The server owns and enforces the cap (`apps/api/src/store/quota.ts`); this
 * only remembers what it last said, so a cold or offline start can show a
 * number instead of a blank. It never *computes* a balance — deriving one from
 * a bundled limit is what went stale in a shipped app.
 *
 * Written from exactly one place, `callAI`, so every AI response refreshes it
 * regardless of whether the call site cares about the count.
 */

const STORAGE_KEY = 'pumppal_ai_quota_v1';

/** UTC day, matching the server's `todayUTC` — the quota rolls over on that boundary. */
const todayUTC = () => new Date().toISOString().slice(0, 10);

type Entry = { uid: string; date: string; remaining: number };

// One entry: only one user is signed in at a time.
let entry: Entry | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeAIQuota(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `null` means "not known" — no cached value, a different user, or a value from
 * a previous UTC day that the server has since reset. Callers must treat it as
 * "allow the attempt"; the server answers 429 if it is actually out.
 */
export function getCachedRemaining(uid: string | undefined): number | null {
  if (!uid || !entry || entry.uid !== uid || entry.date !== todayUTC()) return null;
  return entry.remaining;
}

/** Records what the server just reported. Persistence is best-effort. */
export function recordRemaining(uid: string, remaining: number): void {
  entry = { uid, date: todayUTC(), remaining };
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)).catch(() => {
    // A failed write only costs the next cold start its cached number.
  });
}

/**
 * Loads the persisted value on sign-in. A no-op once anything is already in
 * memory, so it can never clobber a fresher value with a slower disk read.
 */
export async function hydrateAIQuota(uid: string): Promise<void> {
  if (entry) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw || entry) return;
    const stored = JSON.parse(raw) as Partial<Entry>;
    if (stored.uid !== uid || stored.date !== todayUTC()) return;
    if (typeof stored.remaining !== 'number') return;
    entry = { uid, date: stored.date, remaining: stored.remaining };
    emit();
  } catch {
    // Unreadable or malformed cache is the same as no cache.
  }
}

/** Sign-out: the next user must not inherit this one's count. */
export function clearAIQuotaCache(): void {
  entry = null;
  emit();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
