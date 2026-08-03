import { db } from '@/config/firebase';
import { Workout } from '@/types/workout';
import { predictNextWorkoutName } from '@/utils/predict-next-workout';
import { loadSplitNames } from '@/utils/split-names';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

// Resolves what "Up next" actually points at, from scratch. The widget's and the
// watch's cached copy can be stale, so both the pumppal://up-next landing screen and
// the watch's headless action task re-resolve here — same priority chain as the Home
// screen's Up Next card: live workout, then head of the planned queue, then the
// split's predicted next day.
export async function resolveUpNextTarget(uid: string): Promise<{ id?: string; suggestion?: string }> {
  const inProgressSnap = await getDocs(
    query(
      collection(db, 'workouts'),
      where('userId', '==', uid),
      where('status', '==', 'in_progress'),
      limit(1)
    )
  );
  if (!inProgressSnap.empty) return { id: inProgressSnap.docs[0].id };

  const planSnap = await getDocs(
    query(
      collection(db, 'workouts'),
      where('userId', '==', uid),
      where('status', '==', 'planned'),
      orderBy('queueOrder'),
      limit(1)
    )
  );
  if (!planSnap.empty) return { id: planSnap.docs[0].id };

  const historySnap = await getDocs(
    query(collection(db, 'workouts'), where('userId', '==', uid), orderBy('date', 'desc'), limit(30))
  );
  const history = historySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
  const suggestion = predictNextWorkoutName(await loadSplitNames(uid), history);

  return suggestion ? { suggestion } : {};
}
