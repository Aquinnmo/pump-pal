import { WorkoutCard } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { useAuth } from '@/context/auth-context';
import { Workout } from '@/types/workout';
import { generateSplitWorkoutNames } from '@/utils/gemini-workout-suggestions';
import { predictNextWorkoutName, predictWorkoutAfterName } from '@/utils/predict-next-workout';
import { toDateObj } from '@/utils/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const { user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextWorkout, setNextWorkout] = useState<string | null>(null);
  const [nextWorkoutToPlan, setNextWorkoutToPlan] = useState<string | null>(null);
  const [nextPlan, setNextPlan] = useState<Workout | null>(null);
  const [inProgress, setInProgress] = useState<Workout | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        setLoading(true);
        try {
          // Fetch recent workouts for display (min 5, max last 8 days) and prediction (top 20)
          const q = query(
            collection(db, 'workouts'),
            where('userId', '==', user.uid),
            orderBy('date', 'desc'),
            limit(30)
          );
          const snapshot = await getDocs(q);
          const allFetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));

          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          const windowStart = new Date(startOfToday);
          windowStart.setDate(windowStart.getDate() - 7); // 8-day window: today + previous 7 days
          const windowStartMs = windowStart.getTime();

          const withinWindow = allFetched.filter((w) => toDateObj(w.date).getTime() >= windowStartMs);
          setRecentWorkouts(withinWindow.length >= 5 ? withinWindow : allFetched.slice(0, 5));

          // Predict next workout type
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          const userData = userSnap.data();
          const splitType = userData?.workoutSplit?.type;
          const customSplitDesc: string = userData?.workoutSplit?.custom ?? '';
          let splitNames: string[] = isSplitOption(splitType) ? SPLIT_WORKOUT_NAMES[splitType] : [];

          if (splitType === 'Other' && customSplitDesc) {
            const cacheKey = `pumppal_split_names_v2_${customSplitDesc.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
            const cached = await AsyncStorage.getItem(cacheKey);
            if (cached) {
              try { splitNames = JSON.parse(cached); } catch { /* ignore */ }
            } else {
              try {
                const generated = await generateSplitWorkoutNames(customSplitDesc);
                if (generated.length > 0) {
                  splitNames = generated;
                  await AsyncStorage.setItem(cacheKey, JSON.stringify(generated));
                }
              } catch { /* keep the card usable with its fallback label */ }
            }
          }

          setNextWorkout(predictNextWorkoutName(splitNames, allFetched));

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
          setInProgress(
            inProgressSnap.empty ? null : ({ id: inProgressSnap.docs[0].id, ...inProgressSnap.docs[0].data() } as Workout)
          );

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
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      })();
    }, [user])
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleEdit = (workout: Workout) => {
    router.push({ pathname: '/modal', params: { id: workout.id } });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>{user?.displayName ?? 'Athlete'} 💪</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/modal')}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {(inProgress || nextPlan || nextWorkout) && (
        <TouchableOpacity
          style={styles.nextWorkoutCard}
          onPress={() => {
            if (inProgress) {
              router.push({ pathname: '/active-workout', params: { id: inProgress.id } });
            } else if (nextPlan) {
              router.push({ pathname: '/active-workout', params: { id: nextPlan.id } });
            } else {
              router.push({ pathname: '/active-workout', params: { suggestion: nextWorkout ?? '' } });
            }
          }}
          activeOpacity={0.85}>
          <LinearGradient
            colors={['rgba(255, 77, 77, 0.16)', 'rgba(255, 77, 77, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.nextWorkoutGlowTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(255, 77, 77, 0.16)', 'rgba(255, 77, 77, 0)']}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.nextWorkoutGlowBottom}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(255, 77, 77, 0.10)', 'rgba(255, 77, 77, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextWorkoutGlowLeft}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(255, 77, 77, 0.10)', 'rgba(255, 77, 77, 0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 0 }}
            style={styles.nextWorkoutGlowRight}
            pointerEvents="none"
          />
          <View style={styles.nextWorkoutContent}>
            <View style={styles.nextWorkoutLeft}>
              <Text style={styles.nextWorkoutLabel}>{inProgress ? 'Resume:' : 'Up Next:'}</Text>
              <Text style={styles.nextWorkoutName}>
                {inProgress ? inProgress.name : nextPlan ? nextPlan.name : nextWorkout}
              </Text>
            </View>
            <View style={styles.nextWorkoutIcon}>
              <Ionicons name="barbell-outline" size={32} color="#ff4d4d" />
            </View>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.planCard}
        onPress={() => router.push('/planned-workouts')}
        activeOpacity={0.85}>
        <LinearGradient
          colors={['rgba(78, 168, 222, 0.16)', 'rgba(78, 168, 222, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.nextWorkoutGlowTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(78, 168, 222, 0.16)', 'rgba(78, 168, 222, 0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.nextWorkoutGlowBottom}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(78, 168, 222, 0.10)', 'rgba(78, 168, 222, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nextWorkoutGlowLeft}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(78, 168, 222, 0.10)', 'rgba(78, 168, 222, 0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 0 }}
          style={styles.nextWorkoutGlowRight}
          pointerEvents="none"
        />
        <View style={styles.planCardContent}>
          <View style={styles.nextWorkoutLeft}>
            <Text style={styles.planCardLabel}>Plan Workout:</Text>
            <Text style={styles.nextWorkoutName}>{nextWorkoutToPlan ?? 'Choose Workout'}</Text>
          </View>
          <View style={styles.planCardIcon}>
            <Ionicons name="calendar-outline" size={30} color="#4ea8de" />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Workouts</Text>
        <TouchableOpacity
          style={styles.seeAllButton}
          onPress={() => router.push('/(tabs)/workouts')}
          activeOpacity={0.7}>
          <Text style={styles.seeAllText}>See all workouts</Text>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {recentWorkouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barbell-outline" size={56} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to log your first session</Text>
        </View>
      ) : (
        <View style={styles.listWrapper}>
          <FlatList
            data={recentWorkouts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <WorkoutCard workout={item} onEdit={handleEdit} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
          <LinearGradient
            colors={['#0f0f0f', 'transparent']}
            style={styles.fadeTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', '#0f0f0f']}
            style={styles.fadeBottom}
            pointerEvents="none"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 15,
    color: '#888',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#e54242',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#525252',
    backgroundColor: '#2c2c2c',
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  list: {
    paddingTop: 28,
    paddingBottom: 48,
  },
  listWrapper: {
    flex: 1,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#444',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#555',
  },
  nextWorkoutCard: {
    position: 'relative',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
  },
  nextWorkoutGlowTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 20,
  },
  nextWorkoutGlowBottom: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 22,
  },
  nextWorkoutGlowLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 20,
  },
  nextWorkoutGlowRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 22,
  },
  nextWorkoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nextWorkoutLeft: {
    gap: 4,
  },
  nextWorkoutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff8f8f',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  nextWorkoutName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  nextWorkoutIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planCard: {
    position: 'relative',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 24,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
  },
  planCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8fd0f7',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  planCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
