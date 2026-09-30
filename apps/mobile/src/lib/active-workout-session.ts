import AsyncStorage from '@react-native-async-storage/async-storage';

import { randomId } from '@/data/id';
import type { DraftExerciseRow } from '@/types/workout';

// The live workout's only home while it is being edited. A module-level singleton
// (mirrors src/lib/catalog-loader.ts, not React state) so it outlives the
// active-workout screen unmounting — the user can navigate Home mid-workout and
// come back — and is shared with the wear/notification action handlers, which must
// apply a set even while that screen isn't mounted. It's mirrored to AsyncStorage
// so a process death (the app gets backgrounded and Android reclaims it) doesn't
// lose the draft — see loadSession() below. The DB is still only ever written once,
// on Finish.
export type ActiveSession = {
  // Correlates notification/wear taps with this session. Not a Firestore id — no
  // document exists until Finish creates or completes one — so it's generated
  // fresh per session and only ever compared to itself.
  id: string;
  uid: string;
  // Set when the session was started from a planned workout; that row is only
  // ever read, never mutated, until Finish moves it to 'completed'.
  planId: string | null;
  name: string;
  startedAt: string;
  rows: DraftExerciseRow[];
  cameFromPlan: boolean;
};

const STORAGE_KEY = 'pumppal_active_session_v1';
// ponytail: a forgotten/stuck session shouldn't auto-resume days later. Fixed
// window, revisit if a real workout ever legitimately runs this long.
const MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1000;

let session: ActiveSession | null = null;
let sessionGeneration = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

// Fire-and-forget write-through. ponytail: no debounce — the draft is a few KB
// and AsyncStorage writes are async and off-thread; add one if it measurably janks.
let persistence: Promise<void> = Promise.resolve();
function persist(): void {
  const value = session ? JSON.stringify(session) : null;
  persistence = persistence.catch(() => {}).then(() => value
    ? AsyncStorage.setItem(STORAGE_KEY, value)
    : AsyncStorage.removeItem(STORAGE_KEY));
  void persistence.catch(console.warn);
}

/** Background intents must keep their runtime until the private draft is durable. */
export function flushSessionPersistence(): Promise<void> {
  return persistence;
}

export function getSession(): ActiveSession | null {
  return session;
}

export function startSession(init: {
  uid: string;
  planId: string | null;
  name: string;
  rows: DraftExerciseRow[];
  cameFromPlan: boolean;
}): ActiveSession {
  sessionGeneration++;
  session = {
    id: randomId('session'),
    startedAt: new Date().toISOString(),
    ...init,
  };
  notify();
  persist();
  return session;
}

// Patches the live session's rows (and optionally its name) in place. A no-op once
// the session has ended — a stale watch/notification tap landing after Finish or
// Discard must not resurrect it.
export function updateSession(rows: DraftExerciseRow[], name?: string): void {
  if (!session) return;
  sessionGeneration++;
  session = { ...session, rows, ...(name !== undefined ? { name } : {}) };
  notify();
  persist();
}

export function endSession(): void {
  if (!session) return;
  sessionGeneration++;
  session = null;
  notify();
  persist();
}

// Account wipe: drop the live session and its disk snapshot, including one that
// was never loaded into memory (endSession alone is a no-op then).
export async function clearSession(): Promise<void> {
  endSession();
  await flushSessionPersistence();
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Restores the session from disk at boot. A no-op once a session is already in
// memory — a live session always beats disk. Drops a restored session that's too
// old to be a live workout rather than resurrecting a forgotten one.
export async function loadSession(): Promise<ActiveSession | null> {
  if (session) return session;
  const generation = sessionGeneration;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (generation !== sessionGeneration) return session;
  if (!raw) return null;
  let stored: ActiveSession;
  try {
    stored = JSON.parse(raw) as ActiveSession;
  } catch {
    // Unreadable cache is the same as no cache.
    await AsyncStorage.removeItem(STORAGE_KEY).catch(console.warn);
    return null;
  }
  if (Date.now() - new Date(stored.startedAt).getTime() > MAX_RESTORE_AGE_MS) {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(console.warn);
    return null;
  }
  sessionGeneration++;
  session = stored;
  notify();
  return session;
}
