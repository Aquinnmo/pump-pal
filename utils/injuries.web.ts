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
  const start = toDateObj(injury.onsetDate).getTime();
  const end = injury.resolvedDate ? toDateObj(injury.resolvedDate).getTime() : Date.now();
  return date.getTime() >= start && date.getTime() <= end;
}

export async function applyInjuryToHistory(_uid: string, injury: Injury): Promise<number> {
  return (await remote.applyInjuryToHistory(injury.id)).affectedWorkoutIds.length;
}

export async function removeInjuryFromHistory(_uid: string, injuryId: string): Promise<number> {
  return (await remote.removeInjuryFromHistory(injuryId)).affectedWorkoutIds.length;
}
