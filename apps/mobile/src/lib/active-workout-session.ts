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
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

// Fire-and-forget write-through. ponytail: no debounce — the draft is a few KB
// and AsyncStorage writes are async and off-thread; add one if it measurably janks.
function persist(): void {
  if (session) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(console.warn);
  } else {
    AsyncStorage.removeItem(STORAGE_KEY).catch(console.warn);
  }
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
  session = { ...session, rows, ...(name !== undefined ? { name } : {}) };
  notify();
  persist();
}

export function endSession(): void {
  if (!session) return;
  session = null;
  notify();
  persist();
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
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
  session = stored;
  notify();
  return session;
}
