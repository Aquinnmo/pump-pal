import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Workout } from '@/types/workout';
import { loadSplitNames } from '@/utils/split-names';
import { predictNextWorkoutName, predictWorkoutAfterName } from '@/utils/predict-next-workout';
import { describeUpNext } from '@/utils/up-next';
import { buildWearIdleState } from '@/utils/wear-state';
import { pushWearState } from '@/utils/wear-sync';
import { toDateObj } from '@/utils/workout-conversion';
import { dismissWorkoutNotification } from '@/utils/workout-notification';
import { syncUpNextWidget } from '@/utils/widget-up-next';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [nextWorkout, setNextWorkout] = useState<string | null>(null);
  const [nextWorkoutToPlan, setNextWorkoutToPlan] = useState<string | null>(null);
  const [nextPlan, setNextPlan] = useState<Workout | null>(null);
  const [inProgress, setInProgress] = useState<Workout | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!inProgress?.startedAt) return;
    const startMs = toDateObj(inProgress.startedAt as unknown as Workout['date']).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [inProgress?.startedAt]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        setLoading(true);
        try {
          // Completed history is only needed to predict the next split workout.
          const q = query(
            collection(db, 'workouts'),
            where('userId', '==', user.uid),
            orderBy('date', 'desc'),
            limit(30)
          );
          const snapshot = await getDocs(q);
          const allFetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));

          // Predict next workout type
          const splitNames = await loadSplitNames(user.uid);
          const predictedNext = predictNextWorkoutName(splitNames, allFetched);
          setNextWorkout(predictedNext);

          // An in-progress workout (crashed/backgrounded mid-session) takes priority over
          // everything else — Up Next becomes "Resume".
          const inProgressSnap = await getDocs(
            query(
              collection(db, 'workouts'),
              where('userId', '==', user.uid),
              where('status', '==', 'in_progress'),
              limit(1)
            )
          );
          const liveWorkout = inProgressSnap.empty
            ? null
            : ({ id: inProgressSnap.docs[0].id, ...inProgressSnap.docs[0].data() } as Workout);
          setInProgress(liveWorkout);
          // No live workout → clear any notification orphaned by a force-quit.
          if (inProgressSnap.empty) dismissWorkoutNotification();

          // Head of the planned queue, if any — takes priority over the predicted name
          const planSnap = await getDocs(
            query(
              collection(db, 'workouts'),
              where('userId', '==', user.uid),
              where('status', '==', 'planned'),
              orderBy('queueOrder')
            )
          );
          const plannedQueue = planSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
          setNextPlan(plannedQueue[0] ?? null);
          setNextWorkoutToPlan(
            predictWorkoutAfterName(splitNames, allFetched, plannedQueue[plannedQueue.length - 1]?.name)
          );

          // Push the same copy to the home-screen widget (Android only, no-op elsewhere).
          const copy = describeUpNext({
            inProgressName: liveWorkout?.name,
            plannedName: plannedQueue[0]?.name,
            predictedName: predictedNext,
          });
          syncUpNextWidget({
            label: copy.label,
            name: copy.name,
            action: copy.action,
            source: copy.source,
          });
          // The watch gets the same copy — but only when nothing is live. A running
          // workout's watch state is the set-by-set one the active-workout screen
          // pushes, and overwriting it with "Resume" would lose the user's place.
          if (!liveWorkout) pushWearState(buildWearIdleState(copy));
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      })();
    }, [user])
  );

  const formatElapsed = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  const displayName = user?.displayName?.trim() || 'Athlete';
  const isCompact = height < 650;
  const {
    label: upNextEyebrow,
    name: upNextName,
    action: upNextAction,
    source: upNextSource,
  } = describeUpNext({
    inProgressName: inProgress?.name,
    plannedName: nextPlan?.name,
    predictedName: nextWorkout,
  });
  const upNextLabel = inProgress
    ? `Resume ${upNextName}, elapsed time ${formatElapsed(elapsed)}`
    : nextPlan
      ? `Start planned workout, ${upNextName}`
      : nextWorkout
        ? `Start suggested workout, ${upNextName}`
        : 'Start a custom workout';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 12) },
      ]}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greeting()}, {displayName}
        </Text>
      </View>

      <View style={styles.dashboardContent}>
        <View style={[styles.actionStack, isCompact && styles.actionStackCompact]}>
          <Pressable
            style={({ pressed }) => [
              styles.nextWorkoutCard,
              isCompact && styles.nextWorkoutCardCompact,
              pressed && styles.actionPressed,
            ]}
            onPress={() => {
              if (inProgress) {
                router.push({ pathname: '/active-workout', params: { id: inProgress.id } });
              } else if (nextPlan) {
                router.push({ pathname: '/active-workout', params: { id: nextPlan.id } });
              } else if (nextWorkout) {
                router.push({ pathname: '/active-workout', params: { suggestion: nextWorkout } });
              } else {
                router.push('/active-workout');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={upNextLabel}
            accessibilityHint="Opens your active workout">
            <View style={styles.nextWorkoutAccent} pointerEvents="none" />
            <View style={[styles.nextWorkoutContent, isCompact && styles.nextWorkoutContentCompact]}>
              <View style={styles.nextWorkoutHeader}>
                <View style={styles.nextWorkoutContext}>
                  <Text style={styles.nextWorkoutLabel}>{upNextEyebrow}</Text>
                  <View style={styles.contextDivider} />
                  <Text style={styles.nextWorkoutSource} numberOfLines={1}>{upNextSource}</Text>
                </View>
                {inProgress && <Text style={styles.nextWorkoutTimer}>{formatElapsed(elapsed)}</Text>}
              </View>
              <Text style={[styles.nextWorkoutName, isCompact && styles.nextWorkoutNameCompact]} numberOfLines={2}>
                {upNextName}
              </Text>
              <View style={styles.nextWorkoutFooter}>
                <Text style={styles.nextWorkoutAction}>{upNextAction}</Text>
                <Ionicons name="arrow-forward" size={19} color="#e54242" />
              </View>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.supportingCard,
              isCompact && styles.supportingCardCompact,
              pressed && styles.actionPressed,
            ]}
            onPress={() => router.push('/planned-workouts')}
            accessibilityRole="button"
            accessibilityLabel="Plan workout"
            accessibilityHint="Opens your planned workout queue">
            <Ionicons name="calendar-outline" size={23} color="#68b7e7" />
            <View style={styles.supportingCopy}>
              <Text style={styles.supportingTitle}>Plan workout</Text>
              <Text style={styles.supportingDetail} numberOfLines={1}>
                {nextWorkoutToPlan ?? 'Choose workout'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color="#666" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.supportingCard,
              isCompact && styles.supportingCardCompact,
              pressed && styles.actionPressed,
            ]}
            onPress={() => router.push('/(tabs)/workouts')}
            accessibilityRole="button"
            accessibilityLabel="See all workouts"
            accessibilityHint="Opens your workout history">
            <Ionicons name="albums-outline" size={23} color="#b8b8b8" />
            <View style={styles.supportingCopy}>
              <Text style={styles.supportingTitle}>See all workouts</Text>
              <Text style={styles.supportingDetail} numberOfLines={1}>Training history</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color="#666" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#0f0f0f',
  },
  headerCompact: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  dashboardContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  actionStack: {
    width: '100%',
    gap: 12,
  },
  actionStackCompact: {
    gap: 10,
  },
  nextWorkoutCard: {
    height: 218,
    position: 'relative',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#332626',
    overflow: 'hidden',
    backgroundColor: '#1a1818',
  },
  nextWorkoutCardCompact: {
    height: 168,
  },
  nextWorkoutAccent: {
    position: 'absolute',
    top: 20,
    bottom: 20,
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#e54242',
  },
  nextWorkoutContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 14,
  },
  nextWorkoutContentCompact: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  nextWorkoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nextWorkoutContext: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#595959',
  },
  nextWorkoutLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d88383',
  },
  nextWorkoutSource: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#858585',
  },
  nextWorkoutName: {
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#fff',
  },
  nextWorkoutNameCompact: {
    fontSize: 25,
  },
  nextWorkoutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  nextWorkoutAction: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e8e8e8',
  },
  nextWorkoutTimer: {
    fontSize: 17,
    fontWeight: '600',
    color: '#c9c9c9',
    fontVariant: ['tabular-nums'],
  },
  supportingCard: {
    height: 94,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#292929',
    backgroundColor: '#181818',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  supportingCardCompact: {
    height: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  supportingCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 5,
  },
  supportingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f2f2f2',
  },
  supportingDetail: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#898989',
  },
  actionPressed: {
    opacity: 0.72,
  },
});
