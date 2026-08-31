import { toDateKey } from '@/lib/date-key';
import type { ChallengeData, ChallengeDay } from '@/types/pushup-challenge';

/**
 * Build the list of nodes to render.
 * Returns every day from startDate up to today, annotated with completion info.
 */
export function buildTimeline(data: ChallengeData | null): Array<{
  date: string;
  dayNumber: number;
  completed: boolean;
  completedAt: string | null;
  isToday: boolean;
}> {
  if (!data) return [];

  const completionMap = new Map<string, ChallengeDay>();
  for (const day of data.days) {
    completionMap.set(day.date, day);
  }

  const today = toDateKey(new Date());
  const nodes: Array<{
    date: string;
    dayNumber: number;
    completed: boolean;
    completedAt: string | null;
    isToday: boolean;
  }> = [];

  const cursor = new Date(data.startDate + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');
  let dayNum = 1;

  while (cursor <= todayDate) {
    const key = toDateKey(cursor);
    const entry = completionMap.get(key);
    nodes.push({
      date: key,
      dayNumber: dayNum,
      completed: !!entry,
      completedAt: entry?.completedAt ?? null,
      isToday: key === today,
    });
    dayNum++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return nodes;
}

/**
 * Determine if the streak is still alive.
 * The streak is alive if every day before today has been completed.
 * (Today can be incomplete — it's the current day.)
 */
export function isStreakAlive(nodes: ReturnType<typeof buildTimeline>): boolean {
  for (const n of nodes) {
    if (n.isToday) continue;
    if (!n.completed) return false;
  }
  return true;
}

/**
 * Compute current consecutive streak length (from day 1).
 */
export function currentStreakLength(data: ChallengeData | null): number {
  if (!data) return 0;
  const sorted = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  const cursor = new Date(data.startDate + 'T00:00:00');
  for (let i = 0; i < sorted.length; i++) {
    const key = toDateKey(cursor);
    if (sorted[i].date === key) {
      streak++;
      cursor.setDate(cursor.getDate() + 1);
    } else {
      break;
    }
  }
  return streak;
}
