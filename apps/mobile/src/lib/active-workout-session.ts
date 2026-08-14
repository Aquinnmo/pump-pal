import { randomId } from '@/data/id';
import type { DraftExerciseRow } from '@/types/workout';

// The live workout's only home while it is being edited. A module-level singleton
// (mirrors src/lib/catalog-loader.ts, not React state) so it outlives the
// active-workout screen unmounting — the user can navigate Home mid-workout and
// come back — and is shared with the wear/notification action handlers, which must
// apply a set even while that screen isn't mounted. It deliberately does not
// survive a process death: losing an in-flight session is the accepted tradeoff
// for never writing a row to the DB until Finish.
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

let session: ActiveSession | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
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
  return session;
}

// Patches the live session's rows (and optionally its name) in place. A no-op once
// the session has ended — a stale watch/notification tap landing after Finish or
// Discard must not resurrect it.
export function updateSession(rows: DraftExerciseRow[], name?: string): void {
  if (!session) return;
  session = { ...session, rows, ...(name !== undefined ? { name } : {}) };
  notify();
}

export function endSession(): void {
  if (!session) return;
  session = null;
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
