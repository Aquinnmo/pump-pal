import { db } from '@/config/firebase';
import { Injury } from '@/types/user';
import { doc, getDoc } from 'firebase/firestore';

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
