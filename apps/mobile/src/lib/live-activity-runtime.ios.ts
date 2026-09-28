import { AppState } from 'react-native';
import { auth } from '@/config/firebase';
import { configureSyncTrigger } from '@/data/sync-trigger';
import { acknowledgeJournal, readJournal, subscribeJournal } from '@/modules/live-update-notification';
import { flushSessionPersistence, getSession, loadSession } from '@/lib/active-workout-session';
import { finishActiveWorkout, isFinishingWorkout } from '@/lib/finish-active-workout';
import { dismissWorkoutNotification } from '@/lib/workout-notification.ios';
import { handleWorkoutAction } from '@/lib/wear-action-task';
import { parseLiveUpdateNotificationAction, type LiveUpdateNotificationAction } from '@/lib/workout-action';
import { flushWorkoutNotification } from '@/lib/workout-surface-sync';

// Loaded by index.js, before any React screen. Live Activity taps are applied and
// displayed natively (targets/widget/LiveUpdateSharedStore.swift); this replays
// the native journal into the draft whenever JS runs, including the headless host
// FinishWorkoutIntent starts without a UIKit scene.
configureSyncTrigger(() => ({ uid: auth.currentUser?.uid ?? null, currentUid: auth.currentUser?.uid ?? null }));

type JournalEntry = LiveUpdateNotificationAction & { id: string; atMs: number };

function parseJournal(json: string): { ids: string[]; entries: JournalEntry[] } {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ids: [], entries: [] }; }
  const items = Array.isArray(raw) ? (raw as { id?: unknown; atMs?: unknown }[]) : [];
  const ids = items.flatMap(item => (typeof item?.id === 'string' ? [item.id] : []));
  const entries = items.flatMap(item => {
    const action = parseLiveUpdateNotificationAction(JSON.stringify(item));
    return action && typeof item.id === 'string' && typeof item.atMs === 'number' && Number.isFinite(item.atMs)
      ? [{ ...action, id: item.id, atMs: item.atMs }]
      : [];
  });
  return { ids, entries };
}

async function replay(entry: JournalEntry): Promise<void> {
  const session = await loadSession();
  // Taps for another account or an already-ended session are dropped.
  if (!session || session.uid !== auth.currentUser?.uid || session.id !== entry.workoutId) return;
  if (isFinishingWorkout(session.id)) return;
  if (entry.action === 'finishWorkout') {
    await finishActiveWorkout(session.uid, session, true, entry.atMs);
    return;
  }
  // Replays are idempotent: the expectedCompletedSets guard rejects an entry the
  // draft already reflects (e.g. a crash between persisting and acknowledging).
  await handleWorkoutAction(entry, true);
}

let reconciling: Promise<void> = Promise.resolve();

export function reconcileIosWorkoutActions(): Promise<void> {
  reconciling = reconciling.catch(() => {}).then(async () => {
    const { ids, entries } = parseJournal(readJournal());
    if (ids.length === 0) return;
    await auth.authStateReady();
    for (const entry of entries) await replay(entry);
    await flushSessionPersistence();
    // A failed save throws above and keeps the journal for the next foreground.
    await acknowledgeJournal(ids);
    if (getSession()) await flushWorkoutNotification();
    else await dismissWorkoutNotification();
  });
  return reconciling;
}

function reconcileInBackground(): void {
  reconcileIosWorkoutActions().catch(error => console.warn('[Live Activity] reconcile failed', error));
}

subscribeJournal(reconcileInBackground);
AppState.addEventListener('change', state => { if (state === 'active') reconcileInBackground(); });
reconcileInBackground();
