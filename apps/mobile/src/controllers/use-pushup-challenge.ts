import { useAuth } from '@/context/auth-context';
import { useDataVersion } from '@/hooks/use-data-version';
import { pushupRepository } from '@/models/pushup-repository';
import { triggerSyncAfterWrite } from '@/models/sync-trigger';
import { currentStreakLength, buildTimeline, isStreakAlive } from '@/models/pushup-timeline';
import { toDateKey } from '@/lib/date-key';
import { syncStreakReminders } from '@/lib/streak-notification';
import { dayNumberOn } from '@/lib/streak-schedule';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ChallengeData } from '@/types/pushup-challenge';

async function rescheduleReminders(data: ChallengeData | null): Promise<void> {
  const nodes = buildTimeline(data);
  await syncStreakReminders({
    active: !!data && isStreakAlive(nodes),
    todayCompleted: nodes.some((n) => n.isToday && n.completed),
    startDate: data?.startDate ?? null,
  }).catch((e) => console.error('Failed to sync streak reminders', e));
}

export function usePushupChallenge() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const reload = useCallback(async () => {
    void dataVersion; // refetch trigger, not data — see src/hooks/use-data-version.ts
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      const stored = await pushupRepository.get(user.uid);
      const nextData = (stored?.data as ChallengeData | undefined) ?? null;
      setData(nextData);
      await rescheduleReminders(nextData);
    } catch (e) {
      console.error('Failed to load pushup challenge', e);
    } finally {
      setLoading(false);
    }
  }, [user, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const startChallenge = useCallback(async () => {
    if (!user) return;
    const today = toDateKey(new Date());
    const prev = data?.longestStreak ?? 0;
    const newData: ChallengeData = { startDate: today, days: [], longestStreak: prev };
    await pushupRepository.upsert(user.uid, newData);
    triggerSyncAfterWrite();
    setData(newData);
    await rescheduleReminders(newData);
    setRestarting(false);
  }, [data, user]);

  const completeToday = useCallback(async (): Promise<'already-done' | 'completed'> => {
    if (!user || !data) return 'already-done';
    setSaving(true);
    try {
      const today = toDateKey(new Date());
      if (data.days.some((d) => d.date === today)) return 'already-done';

      const dayNumber = dayNumberOn(data.startDate, new Date());
      const newDays = [
        ...data.days,
        { date: today, dayNumber, completedAt: new Date().toISOString() },
      ];
      const newStreak = currentStreakLength({ ...data, days: newDays });
      const updated: ChallengeData = {
        ...data,
        days: newDays,
        longestStreak: Math.max(data.longestStreak ?? 0, newStreak),
      };

      await pushupRepository.upsert(user.uid, updated).catch((e) => console.error('Failed to save pushup completion', e));
      triggerSyncAfterWrite();
      setData(updated);
      await rescheduleReminders(updated);
      return 'completed';
    } finally {
      setSaving(false);
    }
  }, [data, user]);

  const undoToday = useCallback(async () => {
    if (!user || !data) return;
    setSaving(true);
    try {
      const today = toDateKey(new Date());
      const updated: ChallengeData = {
        ...data,
        days: data.days.filter((d) => d.date !== today),
      };

      await pushupRepository.upsert(user.uid, updated).catch((e) => console.error('Failed to undo pushup completion', e));
      triggerSyncAfterWrite();
      setData(updated);
      await rescheduleReminders(updated);
    } catch (e) {
      console.error('Failed to undo pushup completion', e);
    } finally {
      setSaving(false);
    }
  }, [data, user]);

  const restart = useCallback(() => setRestarting(true), []);

  return {
    data,
    loading,
    saving,
    restarting,
    reload,
    completeToday,
    restart,
    startChallenge,
    undoToday,
  };
}
