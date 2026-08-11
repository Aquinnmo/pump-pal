// No-op stub for web. The real implementation lives in
// streak-notification.native.ts and Metro serves it on iOS + Android
// (notifee has no web build).

import type { StreakReminderState } from './streak-schedule';

export type { StreakReminderState } from './streak-schedule';

export async function syncStreakReminders(_state: StreakReminderState): Promise<void> {}
