import { Dropdown } from '@/components/ui/dropdown';
import { Workout } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { useFocusEffect } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMaxExercise, setSelectedMaxExercise] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users', user.uid, 'workouts'),
        orderBy('date', 'asc') // Ascending for chronological chart
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
      setWorkouts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts])
  );

  const { favoriteExercise, maxWeights, chartData, allExercises, heaviestLift, bodyweightExercises, durationExercises } = useMemo(() => {
    if (workouts.length === 0) {
      return { favoriteExercise: null as string | null, maxWeights: {} as Record<string, number>, chartData: null, allExercises: [] as string[], heaviestLift: null as { exercise: string; weight: number } | null, bodyweightExercises: new Set<string>(), durationExercises: new Set<string>() };
    }

    const counts: Record<string, number> = {};
    const maxW: Record<string, number> = {};
    const exerciseHistory: Record<string, { date: string; score: number }[]> = {};
    const bodyweightExercises = new Set<string>();
    const durationExercises = new Set<string>();
    let heaviestLift: { exercise: string; weight: number } | null = null;

    workouts.forEach((w) => {
      const dateObj = w.date instanceof Date ? w.date : new Date((w.date as any).seconds * 1000);
      const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

      w.exercises.forEach((ex) => {
        const name = ex.name.trim();
        if (!name) return;

        // Count for favorite
        counts[name] = (counts[name] || 0) + 1;

        // Track bodyweight / duration status
        if (ex.bodyweight) bodyweightExercises.add(name);
        if (ex.exerciseType === 'Sets of Duration') durationExercises.add(name);

        // Max weight
        maxW[name] = Math.max(maxW[name] || 0, ex.weight);

        // Heaviest single lift overall
        if (!ex.bodyweight && ex.exerciseType !== 'Sets of Duration' && ex.weight > 0 && (!heaviestLift || ex.weight > heaviestLift.weight)) {
          heaviestLift = { exercise: name, weight: ex.weight };
        }

        // Strength-o-meter score:
        // - Duration: max set duration in seconds (minutes * 60 + seconds)
        // - Bodyweight: max reps in a set
        // - Weighted: Epley 1RM formula: weight * (1 + reps / 30)
        const score =
          ex.exerciseType === 'Sets of Duration'
            ? (ex.durationMinutes ?? 0) * 60 + (ex.durationSeconds ?? 0)
            : ex.bodyweight
            ? ex.reps
            : ex.weight * (1 + ex.reps / 30);

        if (!exerciseHistory[name]) {
          exerciseHistory[name] = [];
        }

        // If multiple sets in same workout, keep the max score for that day
        const existingDay = exerciseHistory[name].find((h) => h.date === dateStr);
        if (existingDay) {
          existingDay.score = Math.max(existingDay.score, score);
        } else {
          exerciseHistory[name].push({ date: dateStr, score });
        }
      });
    });

    let fav = null;
    let maxCount = 0;
    for (const [name, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        fav = name;
      }
    }

    const allEx = Object.keys(counts).sort();

    let cData = null;
    const targetEx = selectedExercise || fav;
    
    if (targetEx && exerciseHistory[targetEx] && exerciseHistory[targetEx].length > 0) {
      const history = exerciseHistory[targetEx];
      // ChartKit needs at least 1 data point, but looks better with 2. We'll pass it anyway.
      cData = {
        labels: history.map((h) => h.date),
        datasets: [
          {
            data: history.map((h) => h.score),
          },
        ],
      };
    }

    return {
      favoriteExercise: fav,
      maxWeights: maxW,
      chartData: cData,
      allExercises: allEx,
      heaviestLift,
      bodyweightExercises,
      durationExercises,
    };
  }, [workouts, selectedExercise]);

  // Set initial selected exercise once data loads
  useEffect(() => {
    if (!selectedExercise && favoriteExercise) {
      setSelectedExercise(favoriteExercise);
    }
    if (!selectedMaxExercise && favoriteExercise) {
      setSelectedMaxExercise(favoriteExercise);
    }
  }, [favoriteExercise, selectedExercise, selectedMaxExercise]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Analytics</Text>

      {workouts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Log some workouts to see your analytics!</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Favorite Exercise</Text>
            <Text style={styles.cardValue}>{favoriteExercise || 'N/A'}</Text>
          </View>

          {heaviestLift && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Heaviest Lift</Text>
              <Text style={styles.cardSubtitle}>{heaviestLift.exercise}</Text>
              <Text style={styles.cardValue}>{heaviestLift.weight} lbs</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Strength-O-Meter</Text>
            <Text style={styles.cardSubtitle}>
              {selectedExercise && durationExercises.has(selectedExercise)
                ? 'Max set duration (seconds) over time'
                : selectedExercise && bodyweightExercises.has(selectedExercise)
                ? 'Max reps per session over time'
                : 'Estimated 1RM over time'}
            </Text>

            {allExercises.length > 0 && (
              <Dropdown
                options={allExercises}
                value={selectedExercise}
                onSelect={setSelectedExercise}
                placeholder="Select an exercise"
                style={styles.dropdownRow}
              />
            )}

            {chartData && chartData.labels.length > 0 ? (
              <LineChart
                data={chartData}
                width={screenWidth - 72} // padding
                height={220}
                chartConfig={{
                  backgroundColor: '#1c1c1c',
                  backgroundGradientFrom: '#1c1c1c',
                  backgroundGradientTo: '#1c1c1c',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(229, 66, 66, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                  propsForDots: {
                    r: '4',
                    strokeWidth: '2',
                    stroke: '#e54242',
                  },
                }}
                bezier
                style={styles.chart}
              />
            ) : (
              <Text style={styles.emptyText}>Not enough data for this exercise.</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Max Weight</Text>
            <Text style={styles.cardSubtitle}>Highest weight lifted</Text>

            <Dropdown
              options={allExercises}
              value={selectedMaxExercise}
              onSelect={setSelectedMaxExercise}
              placeholder="Select an exercise"
              style={styles.dropdownRow}
            />

            {selectedMaxExercise && maxWeights[selectedMaxExercise] !== undefined ? (
              <Text style={styles.cardValue}>{maxWeights[selectedMaxExercise]} lbs</Text>
            ) : (
              <Text style={styles.emptyText}>No data for this exercise.</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 24,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
  },
  card: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e54242',
    marginTop: 8,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  dropdownRow: {
    marginBottom: 12,
  },
});
