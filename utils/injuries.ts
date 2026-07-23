import { db } from '@/config/firebase';
import { Injury } from '@/types/user';
import { toDateObj } from '@/utils/workout-conversion';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Ids of the user's currently-ongoing injuries. Read at workout-completion time
 * so the workout doc records which injuries were active during the session.
 * Returns [] on any read failure or when the user doc has no injuries yet.
 */
export async function getOngoingInjuryIds(uid: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const injuries = (snap.data()?.injuries ?? []) as Injury[];
    return injuries.filter((i) => i.status === 'ongoing').map((i) => i.id);
  } catch {
    return [];
  }
}

/**
 * Does this injury cover a workout performed on `date`? An injury spans
 * [onsetDate, resolvedDate ?? now]. Pure — the one piece worth eyeballing.
 */
export function injuryCoversDate(injury: Injury, date: Date): boolean {
  const start = toDateObj(injury.onsetDate).getTime();
  const end = injury.resolvedDate ? toDateObj(injury.resolvedDate).getTime() : Date.now();
  const t = date.getTime();
  return t >= start && t <= end;
}

/**
 * Stamp `injury.id` onto every COMPLETED workout (has a `date`) within the
 * injury's window. arrayUnion is idempotent, so re-applying never duplicates.
 * Returns the number of workouts stamped.
 * ponytail: unbounded Promise.all fan-out — fine for personal history (dozens–
 * hundreds of workouts); chunk into writeBatch(≤450) only if a user ever has thousands.
 */
export async function applyInjuryToHistory(uid: string, injury: Injury): Promise<number> {
  const snap = await getDocs(query(collection(db, 'workouts'), where('userId', '==', uid)));
  const targets = snap.docs.filter((d) => {
    const data = d.data();
    if (!data.date) return false; // planned/in_progress — not history
    return injuryCoversDate(injury, toDateObj(data.date));
  });
  await Promise.all(targets.map((d) => updateDoc(d.ref, { injuries: arrayUnion(injury.id) })));
  return targets.length;
}

/**
 * Strip `injuryId` from every workout that currently carries it. Returns the
 * number of workouts unstamped. (Deleting the user-level record is the caller's job.)
 */
export async function removeInjuryFromHistory(uid: string, injuryId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'workouts'), where('userId', '==', uid)));
  const targets = snap.docs.filter((d) => ((d.data().injuries ?? []) as string[]).includes(injuryId));
  await Promise.all(targets.map((d) => updateDoc(d.ref, { injuries: arrayRemove(injuryId) })));
  return targets.length;
}
