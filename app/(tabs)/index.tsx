import { Workout, WorkoutCard } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { useAuth } from '@/context/auth-context';
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
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const { user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextWorkout, setNextWorkout] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        setLoading(true);
        try {
          // Fetch recent workouts for display (top 3) and prediction (top 20)
          const q = query(
            collection(db, 'users', user.uid, 'workouts'),
            orderBy('date', 'desc'),
            limit(20)
          );
          const snapshot = await getDocs(q);
          const allFetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
          setRecentWorkouts(allFetched.slice(0, 3));

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
            }
          }

          if (splitNames.length > 1) {
            const lastSplitWorkout = allFetched.find((w) => splitNames.includes(w.name));
            if (lastSplitWorkout) {
              const lastIdx = splitNames.indexOf(lastSplitWorkout.name);
              setNextWorkout(splitNames[(lastIdx + 1) % splitNames.length]);
            } else {
              setNextWorkout(splitNames[0]);
            }
          } else if (splitNames.length === 1) {
            setNextWorkout(splitNames[0]);
          } else {
            setNextWorkout(null);
          }
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

      {nextWorkout && (
        <TouchableOpacity
          style={styles.nextWorkoutCard}
          onPress={() => router.push('/modal')}
          activeOpacity={0.85}>
          <View style={styles.nextWorkoutLeft}>
            <Text style={styles.nextWorkoutLabel}>Today's Workout:</Text>
            <Text style={styles.nextWorkoutName}>{nextWorkout}</Text>
          </View>
          <View style={styles.nextWorkoutIcon}>
            <Ionicons name="barbell-outline" size={32} color="#e54242" />
          </View>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Recent Workouts</Text>

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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 14,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  nextWorkoutLeft: {
    gap: 4,
  },
  nextWorkoutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e54242',
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
    backgroundColor: '#2a1010',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
