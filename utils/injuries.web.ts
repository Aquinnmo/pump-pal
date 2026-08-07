import { Injury } from '@/types/user';
import * as remote from '@/repositories/remote/injuries';
import { toDateObj } from '@/utils/workout-conversion';

export async function getOngoingInjuryIds(_uid: string): Promise<string[]> {
  return (await getOngoingInjuries(_uid)).map((injury) => injury.id);
}

export async function getOngoingInjuries(_uid: string): Promise<Injury[]> {
  const { injuries } = await remote.listInjuries();
  return injuries.filter((injury) => injury.status === 'ongoing') as Injury[];
}

export function injuryCoversDate(injury: Injury, date: Date): boolean {
  const startDate = toDateObj(injury.onsetDate);
  const endDate = injury.resolvedDate ? toDateObj(injury.resolvedDate) : new Date();
  if (!startDate || !endDate) return false;
  const start = startDate.getTime();
  const end = endDate.getTime();
  return date.getTime() >= start && date.getTime() <= end;
}

export async function applyInjuryToHistory(_uid: string, injury: Injury): Promise<number> {
  return (await remote.applyInjuryToHistory(injury.id)).affectedWorkoutIds.length;
}

export async function removeInjuryFromHistory(_uid: string, injuryId: string): Promise<number> {
  return (await remote.removeInjuryFromHistory(injuryId)).affectedWorkoutIds.length;
}
