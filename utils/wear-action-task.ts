import { auth, db } from '@/config/firebase';
import { DraftExerciseRow, PerformedExercise, Workout } from '@/types/workout';
import { getOngoingInjuryIds } from '@/utils/injuries';
import { describeUpNext } from '@/utils/up-next';
import { resolveUpNextTarget } from '@/utils/up-next-target';
import { buildWorkoutNotificationPresentation } from '@/utils/workout-notification-model';
import { dismissWorkoutNotification, ensureWorkoutChannel, showWorkoutNotification } from '@/utils/workout-notification';
import { applyWearAction, buildWearActiveState, buildWearIdleState, WearAction } from '@/utils/wear-state';
import {
  matchesExpectedCompletedSets,
  type LiveUpdateNotificationAction,
  type WorkoutMutationAction,
} from '@/utils/workout-action';
import { pushWearState } from '@/utils/wear-sync';
import { buildPerformedExercise, collapseSetsToDraft, toDateObj } from '@/utils/workout-conversion';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

// Applies a watch action against Firestore directly. Used on two paths:
//   - the root layout, when the app is running but the active-workout screen (which
//     owns the draft state) is not mounted;
//   - the headless task below, when the app process is dead entirely.
// The active-workout screen never routes through here — it mutates its own draft
// state so the user sees the change land, and its autosave writes the doc.

// Set by the active-workout screen while it is mounted. Without it the root
// subscriber would double-apply every set action.
let screenOwnsActions = false;
let actionQueue: Promise<void> = Promise.resolve();

export function setScreenOwnsWorkoutActions(owns: boolean): void {
  screenOwnsActions = owns;
}

export function screenOwnsWorkoutActions(): boolean {
  return screenOwnsActions;
}

// Temporary aliases preserve the current Wear-only call sites while the unified
// name makes ownership rules explicit for both remote control surfaces.
export const setScreenOwnsWearActions = setScreenOwnsWorkoutActions;
export const screenOwnsWearActions = screenOwnsWorkoutActions;

async function loadOwnedWorkout(workoutId: string, uid: string): Promise<Workout | null> {
  const snap = await getDoc(doc(db, 'workouts', workoutId));
  if (!snap.exists()) return null;
  const workout = { id: snap.id, ...snap.data() } as Workout;
  // Someone else's workout, or one that already ended — a stale watch must not touch it.
  if (workout.userId !== uid || workout.status !== 'in_progress') return null;
  return workout;
}

function pushIdleFallback(): void {
  // Generic copy on purpose: resolving the real "up next" name costs three queries,
  // and tapping it re-resolves the true target anyway. The Home screen overwrites
  // this with the specific name the moment the app is opened.
  pushWearState(buildWearIdleState(describeUpNext({})));
}

async function startWorkout(uid: string): Promise<void> {
  const target = await resolveUpNextTarget(uid);

  if (target.id) {
    const snap = await getDoc(doc(db, 'workouts', target.id));
    if (!snap.exists()) return pushIdleFallback();
    const workout = { id: snap.id, ...snap.data() } as Workout;
    if (workout.userId !== uid) return pushIdleFallback();
    if (workout.status === 'planned') {
      await updateDoc(doc(db, 'workouts', target.id), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    pushWearState(
      buildWearActiveState(
        workout.id,
        workout.name ?? '',
        (workout.performedExercises ?? []).map(collapseSetsToDraft)
      )
    );
    return;
  }

  // Nothing live or planned: open a fresh session named after the split prediction.
  // It has no exercises yet, so the watch shows "empty" — they get picked on the phone.
  const created = await addDoc(collection(db, 'workouts'), {
    userId: uid,
    name: target.suggestion ?? '',
    performedExercises: [],
    status: 'in_progress',
    startedAt: serverTimestamp(),
    schemaVersion: 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  pushWearState(buildWearActiveState(created.id, target.suggestion ?? '', []));
}

async function refreshWorkoutNotification(workout: Workout, rows: DraftExerciseRow[]): Promise<void> {
  const startedAt = workout.startedAt ? toDateObj(workout.startedAt) : new Date();
  // Establish the single selected surface before posting: a cold headless process
  // must not recreate both the native Live Update and the Notifee fallback.
  await ensureWorkoutChannel();
  await showWorkoutNotification(
    buildWorkoutNotificationPresentation({
      workoutId: workout.id,
      workoutName: workout.name ?? '',
      startedAt,
      rows,
    }),
  );
}

function isLiveUpdateNotificationAction(
  action: WearAction | LiveUpdateNotificationAction,
): action is LiveUpdateNotificationAction {
  return 'expectedCompletedSets' in action;
}

async function applySetAction(
  action: WorkoutMutationAction & { workoutId: string },
  uid: string,
): Promise<void> {
  const workout = await loadOwnedWorkout(action.workoutId, uid);
  if (!workout) return pushIdleFallback();

  // Round-trips through the same draft conversion the phone editor uses, so hold
  // seconds, notes and migrated legacy blobs survive a watch tap untouched.
  const rows = (workout.performedExercises ?? []).map(collapseSetsToDraft);
  if (isLiveUpdateNotificationAction(action) && !matchesExpectedCompletedSets(rows, action)) return;
  const next = applyWearAction(rows, action);
  if (next === rows) return;
  const performedExercises: PerformedExercise[] = next
    .filter((row) => row.label.trim() !== '')
    .map((row, order) => buildPerformedExercise(row, order));

  // Both surfaces show the applied action before the write is acked — waiting on a
  // Firestore round trip to redraw a notification the user just tapped is the whole
  // perceived delay. The write still awaits below, so the action queue stays serialized.
  pushWearState(buildWearActiveState(workout.id, workout.name ?? '', next));
  await refreshWorkoutNotification(workout, next);

  await updateDoc(doc(db, 'workouts', workout.id), {
    performedExercises,
    updatedAt: serverTimestamp(),
  });
}

async function finishWorkout(
  action: Extract<WearAction, { action: 'finishWorkout' }> | LiveUpdateNotificationAction,
  uid: string,
): Promise<void> {
  const workout = await loadOwnedWorkout(action.workoutId, uid);
  if (!workout) return pushIdleFallback();

  const rows = (workout.performedExercises ?? []).map(collapseSetsToDraft);
  if (isLiveUpdateNotificationAction(action) && !matchesExpectedCompletedSets(rows, action)) return;

  // Same rule as app/active-workout.tsx: only completed sets are logged, and the
  // `completed` flag itself is stripped so finished docs stay clean.
  const performedExercises: PerformedExercise[] = (workout.performedExercises ?? [])
    .map((pe) => ({ ...pe, sets: pe.sets.filter((s) => s.completed) }))
    .filter((pe) => pe.sets.length > 0)
    .map((pe, order) => ({
      ...pe,
      order,
      sets: pe.sets.map(({ completed, ...rest }) => rest),
    }));

  await updateDoc(doc(db, 'workouts', workout.id), {
    name: workout.name || 'Workout',
    date: Timestamp.fromDate(new Date()),
    performedExercises,
    status: 'completed',
    injuries: await getOngoingInjuryIds(uid),
    updatedAt: serverTimestamp(),
  });
  await dismissWorkoutNotification();
  pushIdleFallback();
}

async function applyWorkoutAction(
  action: WearAction | LiveUpdateNotificationAction,
  uid: string,
): Promise<void> {
  switch (action.action) {
    case 'startWorkout':
      return startWorkout(uid);
    case 'completeSet':
    case 'uncompleteSet':
      if (!action.workoutId?.trim()) return;
      return applySetAction(action, uid);
    case 'finishWorkout':
      if (!action.workoutId?.trim()) return;
      return finishWorkout(action, uid);
  }
}

// Firestore's read-modify-write path has no local transaction for this draft
// conversion, so remote deliveries are queued to prevent two rapid taps from
// applying against the same stale document snapshot.
export function handleWorkoutAction(
  action: WearAction | LiveUpdateNotificationAction,
  uid: string,
): Promise<void> {
  const queued = actionQueue.then(() => applyWorkoutAction(action, uid));
  actionQueue = queued.catch(() => {});
  return queued;
}

export const handleWearAction = handleWorkoutAction;

// Headless entry point, registered as "TimberWearAction" in index.js and started by
// WearActionTaskService when a watch message arrives with the app process dead.
export async function wearActionTask(data: { json?: string }): Promise<void> {
  try {
    const action = JSON.parse(data?.json ?? '') as WearAction;
    // Firebase Auth restores from its AsyncStorage persistence here just as it does
    // at app start; without waiting, currentUser is still null on a cold process.
    await auth.authStateReady();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await handleWearAction(action, uid);
  } catch (err) {
    console.warn('Wear action task failed', err);
  }
}
