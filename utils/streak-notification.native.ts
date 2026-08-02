import notifee, { AndroidImportance, TriggerType } from "@notifee/react-native";
// Import from ./streak-schedule, never from ./streak-notification: on native,
// that specifier resolves back to this file and the module cycle hangs startup.
import {
  LAST_CALL_HOUR,
  LOST_HOUR,
  NUDGE_HOUR,
  dayNumberOn,
  nextFireAt,
  type StreakReminderState,
} from "./streak-schedule";

export type { StreakReminderState } from "./streak-schedule";

const CHANNEL_ID = "streak-reminder";
const NUDGE_ID = "streak-nudge";
const LAST_CALL_ID = "streak-last-call";
const LOST_ID = "streak-lost";

/**
 * Cancel and re-create both streak reminders to match the current challenge state.
 * Called on every state change, so the next fire time always skips a day already logged.
 */
export async function syncStreakReminders(
  state: StreakReminderState,
): Promise<void> {
  await notifee.cancelTriggerNotifications([NUDGE_ID, LAST_CALL_ID, LOST_ID]);
  if (!state.active || !state.startDate) return;

  await notifee.requestPermission();

  // HIGH importance = heads-up banner + sound. These are the last warning before
  // the streak dies, so they must never be silent.
  // Note: Android locks a channel's importance after first creation — if a prior
  // build created this channel quieter, reinstall to pick up the change.
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Streak Reminders",
    importance: AndroidImportance.HIGH,
  });

  const now = new Date();

  // The post-mortem lands the morning after the day the warnings are about, so
  // it stays armed when today is already logged — these are one-shot triggers
  // and a user who misses tomorrow may never reopen the screen to re-sync.
  const lostFire = nextFireAt(LOST_HOUR, now, true);
  if (state.todayCompleted) lostFire.setDate(lostFire.getDate() + 1);

  const reminders = [
    {
      id: NUDGE_ID,
      fire: nextFireAt(NUDGE_HOUR, now, state.todayCompleted),
      title: "Streak at risk! 🔥",
      body: (day: number) =>
        `Day ${day} — ${day} pushup${day === 1 ? "" : "s"} left today.`,
    },
    {
      id: LAST_CALL_ID,
      fire: nextFireAt(LAST_CALL_HOUR, now, state.todayCompleted),
      title: "🔥🔥 Last call!! 🔥🔥",
      body: (day: number) =>
        `Day ${day} — ${day} pushup${day === 1 ? "" : "s"}. Your streak dies at midnight.`,
    },
    {
      id: LOST_ID,
      fire: lostFire,
      title: "Streak lost 💔",
      body: () =>
        "You missed a day, so the streak reset. Start again today — Day 1, 1 pushup.",
    },
  ];

  for (const { id, fire, title, body } of reminders) {
    const day = dayNumberOn(state.startDate, fire);

    await notifee.createTriggerNotification(
      {
        id,
        title,
        body: body(day),
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: "default" }, // tap opens the app
          // ponytail: no smallIcon — falls back to the app icon (may render as a
          // white square). Add an ic_stat_* drawable if the shade icon looks off.
        },
        ios: {
          sound: "default",
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fire.getTime(),
        // One-shot, not RepeatFrequency.DAILY: after a miss the streak is dead
        // and a repeating reminder would nag forever with stale copy. Every
        // completion re-syncs and arms the next day's set.
        // ponytail: no alarmManager — inexact alarm, so no SCHEDULE_EXACT_ALARM
        // permission needed. May drift a few minutes under Doze. Switch to
        // alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE } if
        // minute-accuracy ever matters.
      },
    );
  }
}
