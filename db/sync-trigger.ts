// Native lifecycle/connectivity/background wiring for the sync engine.
// Thin binding layer (like db/client.ts, db/sync.ts) — not unit-testable via
// tsx since it imports react-native/NetInfo/TaskManager; the mutex coalescing
// it relies on IS tested, in db/keyed-mutex.test.ts.
//
// Web build: db/sync-trigger.web.ts — same exported function names, all
// no-ops, so web never bundles NetInfo/TaskManager/BackgroundTask and
// context/auth-context.tsx can call this uniformly on both platforms.
import * as BackgroundTask from 'expo-background-task';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import { syncNow } from './sync';
import { InitialSyncOutcome, initialSyncOutcomeFromError, initialSyncOutcomeFromSync } from './initial-sync';
import type { SyncOutcome } from './sync-engine';

const BACKGROUND_TASK_NAME = 'pumppal-background-sync';

type UidProvider = () => { uid: string | null; currentUid: string | null };
let getUids: UidProvider = () => ({ uid: null, currentUid: null });

/** Called once from context/auth-context.tsx so this module never imports Firebase itself. */
export function configureSyncTrigger(provider: UidProvider): void {
  getUids = provider;
}

type ReportedSyncResult = { outcome: SyncOutcome } | { error: unknown };

async function runAndReportSync(): Promise<ReportedSyncResult> {
  const { uid, currentUid } = getUids();
  if (!uid || !currentUid || uid !== currentUid) return { outcome: { status: 'auth-required' } };
  try {
    const outcome = await syncNow(uid, currentUid);
    // "pulled: 0" and "the run threw" are different diagnoses, and there is no
    // in-app status surface any more, so these two lines are the only place a
    // sync outcome is observable at all.
    console.log('[sync]', JSON.stringify(outcome));
    return { outcome };
  } catch (err) {
    console.warn('[sync] run failed:', err);
    return { error: err };
  }
}

/**
 * Fire-and-forget — call after an explicit user save commits, never after an
 * incidental write. The active workout autosaves every ~800ms and must not
 * reach this; a session goes up when it is finished, not set by set.
 *
 * Undebounced on purpose. The old 3s leading-edge guard was sized for autosave
 * bursts this no longer sees, and on real saves it *dropped* the second of two
 * made close together, stranding that data until the next foreground.
 * Genuinely concurrent runs are already coalesced by db/sync.ts's per-uid mutex.
 *
 * ponytail: a run with an empty outbox still fetches the full manifest, so a
 * save that failed to queue costs one pointless pull. Guard with a listAll()
 * check first if that ever shows up in traffic.
 */
export function triggerSyncAfterWrite(): void {
  void runAndReportSync();
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  // Best-effort, bounded, safe to terminate: a small item budget and a hard
  // wall-clock cap well inside the OS's background execution window (~30s on
  // both platforms for this kind of task) so the task always finishes
  // cleanly rather than getting killed mid-transaction.
  const { uid, currentUid } = getUids();
  if (!uid || !currentUid || uid !== currentUid) return BackgroundTask.BackgroundTaskResult.Success;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const outcome = await syncNow(uid, currentUid, { maxOutboxItems: 50, signal: controller.signal });
    console.log('[sync] background', JSON.stringify(outcome));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn('[sync] background run failed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    clearTimeout(timeout);
  }
});

let initialSync: Promise<InitialSyncOutcome> | null = null;
let initialSyncUid: string | null = null;

async function runInitialSync(uid: string): Promise<InitialSyncOutcome> {
  const result = await runAndReportSync();
  const { uid: activeUid, currentUid } = getUids();
  // Do not let an older account's completion decide the new account's route.
  if (activeUid !== uid || currentUid !== uid) return { kind: 'auth-transition', uid };
  return 'error' in result
    ? initialSyncOutcomeFromError(uid, result.error)
    : initialSyncOutcomeFromSync(uid, result.outcome);
}

function beginInitialSync(): Promise<InitialSyncOutcome> {
  const { uid, currentUid } = getUids();
  if (!uid || uid !== currentUid) return Promise.resolve({ kind: 'auth-transition', uid: uid ?? '' });
  initialSyncUid = uid;
  initialSync = runInitialSync(uid);
  return initialSync;
}
/**
 * Resolves to a structured sign-in bootstrap result. A caller for a different
 * UID receives an auth-transition outcome rather than an old account's data.
 */
export function waitForInitialSync(uid: string): Promise<InitialSyncOutcome> {
  return initialSync && initialSyncUid === uid
    ? initialSync
    : Promise.resolve({ kind: 'auth-transition', uid });
}

/** Starts a fresh, user-requested bootstrap attempt after a recoverable failure. */
export function retryInitialSync(uid: string): Promise<InitialSyncOutcome> {
  const { uid: activeUid, currentUid } = getUids();
  if (activeUid !== uid || currentUid !== uid) return Promise.resolve({ kind: 'auth-transition', uid });
  return beginInitialSync();
}

let started = false;
let appStateSubscription: { remove(): void } | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
let lastConnected: boolean | null = null;

/** Call once at app bootstrap (after configureSyncTrigger), e.g. from AuthProvider on sign-in. */
export function startSyncTriggers(): void {
  if (started || Platform.OS === 'web') return;
  started = true;

  void beginInitialSync();

  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void runAndReportSync();
  });

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const connected = state.isConnected === true && state.isInternetReachable !== false;
    // Only trigger on the offline -> online transition, not every NetInfo
    // event (it fires on detail changes like signal strength too) — a
    // connectivity check here is a hint the request might work, not proof.
    if (connected && lastConnected === false) void runAndReportSync();
    lastConnected = connected;
  });

  BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
    minimumInterval: 15, // minutes — OS treats this as a floor, not a guarantee
  }).catch((err) => {
    console.warn('Background sync task registration failed', err);
  });
}

export function stopSyncTriggers(): void {
  started = false;
  initialSync = null;
  initialSyncUid = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  netInfoUnsubscribe?.();
  netInfoUnsubscribe = null;
  BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME).catch(() => {});
}
