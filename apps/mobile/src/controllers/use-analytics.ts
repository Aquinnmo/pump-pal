import { useAuth } from '@/context/auth-context';
import { useDataVersion } from '@/hooks/use-data-version';
import { computeAnalyticsSummary } from '@/models/analytics-summary';
import { workoutRepository } from '@/models/workout-repository';
import type { Workout } from '@/types/workout';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export function useAnalytics() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchWorkouts = useCallback(async () => {
    void dataVersion; // refetch trigger, not data — see src/hooks/use-data-version.ts
    if (!user) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    setFetchError(false);
    try {
      setWorkouts(
        (await workoutRepository.getHistory(user.uid)).map(
          (record) => record.data,
        ),
      );
    } catch (error) {
      console.error(error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [user, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts]),
  );

  return {
    workouts,
    summary: useMemo(() => computeAnalyticsSummary(workouts), [workouts]),
    loading,
    fetchError,
    reload: fetchWorkouts,
  };
}
