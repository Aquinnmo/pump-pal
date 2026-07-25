// Pure scheduling logic for the pushup-challenge reminders.
// Lives in its own file (no .native/.web variants) because a platform-suffixed
// file cannot import the base name at runtime — Metro resolves it back to
// itself. See streak-notification.native.ts.

export type StreakReminderState = {
  /** Challenge exists AND the streak is still alive. */
  active: boolean;
  todayCompleted: boolean;
  /** YYYY-MM-DD */
  startDate: string | null;
};

export const NUDGE_HOUR = 18; // 6 PM
export const LAST_CALL_HOUR = 22; // 10 PM
export const LOST_HOUR = 9; // 9 AM, morning after a miss

/**
 * Next local occurrence of `hour`.
 * Skips to tomorrow when today is already logged or the hour has passed.
 */
export function nextFireAt(hour: number, now: Date, skipToday: boolean): Date {
  const t = new Date(now);
  t.setHours(hour, 0, 0, 0);
  if (skipToday || t <= now) t.setDate(t.getDate() + 1);
  return t;
}
