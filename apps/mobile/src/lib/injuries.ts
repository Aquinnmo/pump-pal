import { injuryRepository } from '@/data/injury-repository';
import { workoutRepository } from '@/data/workout-repository';
import { Injury } from '@/types/user';
import { toDateObj } from '@/lib/workout-conversion';

/**
 * Ids of the user's currently-ongoing injuries. Read at workout-completion time
 * so the workout doc records which injuries were active during the session.
 * Returns [] on any read failure or when the user doc has no injuries yet.
 */
export async function getOngoingInjuryIds(uid: string): Promise<string[]> {
  return (await getOngoingInjuries(uid)).map((injury) => injury.id);
}

/**
 * Read the user's currently-ongoing injuries for AI or other contextual
 * features. Resolved injuries are intentionally excluded from this result.
 * Returns [] on any read failure or when the user doc has no injuries yet.
 */
export async function getOngoingInjuries(uid: string): Promise<Injury[]> {
  try {
    const injuries = await injuryRepository.getAll(uid);
    return injuries.map((record) => record.data).filter((i) => i.status === 'ongoing');
  } catch {
    return [];
  }
}

/**
 * Does this injury cover a workout performed on `date`? An injury spans
 * [onsetDate, resolvedDate ?? now]. Pure — the one piece worth eyeballing.
 */
export function injuryCoversDate(injury: Injury, date: Date): boolean {
  const startDate = toDateObj(injury.onsetDate);
  const endDate = injury.resolvedDate ? toDateObj(injury.resolvedDate) : new Date();
  if (!startDate || !endDate) return false;
  const start = startDate.getTime();
  const end = endDate.getTime();
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
  const workouts = await workoutRepository.getHistory(uid);
  const targets = workouts.filter((record) => {
    const data = record.data;
    if (!data.date) return false; // planned/in_progress — not history
    const date = toDateObj(data.date);
    return date ? injuryCoversDate(injury, date) : false;
  });
  await Promise.all(targets.map(({ id, data }) => workoutRepository.update(uid, id, {
    ...data,
    injuries: [...new Set([...(data.injuries ?? []), injury.id])],
  })));
  return targets.length;
}

/**
 * Strip `injuryId` from every workout that currently carries it. Returns the
 * number of workouts unstamped. (Deleting the user-level record is the caller's job.)
 */
export async function removeInjuryFromHistory(uid: string, injuryId: string): Promise<number> {
  const workouts = await workoutRepository.getHistory(uid);
  const targets = workouts.filter(({ data }) => (data.injuries ?? []).includes(injuryId));
  await Promise.all(targets.map(({ id, data }) => workoutRepository.update(uid, id, {
    ...data,
    injuries: (data.injuries ?? []).filter((id) => id !== injuryId),
  })));
  return targets.length;
}
