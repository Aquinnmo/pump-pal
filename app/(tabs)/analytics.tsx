import { MuscleInsightCards } from '@/components/muscle-insight-cards';
import { Dropdown } from '@/components/ui/dropdown';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Workout } from '@/types/workout';
import { exerciseLabel, isDurationExercise, toDateObj } from '@/utils/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_CHART_LABELS = 6;

const chartConfig = {
  backgroundColor: '#171717',
  backgroundGradientFrom: '#171717',
  backgroundGradientTo: '#171717',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(229, 66, 66, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(194, 194, 194, ${opacity})`,
  propsForBackgroundLines: {
    stroke: '#2b2b2b',
    strokeDasharray: '',
  },
  propsForDots: {
    r: '4',
    strokeWidth: '2',
    stroke: '#0f0f0f',
  },
  propsForLabels: {
    fontSize: 13,
  },
};

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMaxExercise, setSelectedMaxExercise] = useState<string | null>(null);
  const [selectedMaxRepsExercise, setSelectedMaxRepsExercise] = useState<string | null>(null);
  const [selectedLongestDurationExercise, setSelectedLongestDurationExercise] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async () => {
    if (!user) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(false);
    try {
      const workoutsQuery = query(
        collection(db, 'workouts'),
        where('userId', '==', user.uid),
        orderBy('date', 'asc')
      );
      const snapshot = await getDocs(workoutsQuery);
      setWorkouts(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Workout)));
    } catch (error) {
      console.error(error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts])
  );

  const {
    favoriteExercise,
    favoriteWorkoutType,
    maxWeights,
    maxReps,
    maxDuration,
    chartData,
    allExercises,
    weightedExercises,
    bodyweightExerciseList,
    durationExerciseList,
    heaviestLift,
    bodyweightExercises,
    durationExercises,
  } = useMemo(() => {
    if (workouts.length === 0) {
      return {
        favoriteExercise: null as string | null,
        favoriteWorkoutType: null as string | null,
        maxWeights: {} as Record<string, number>,
        maxReps: {} as Record<string, number>,
        maxDuration: {} as Record<string, number>,
        chartData: null,
        allExercises: [] as string[],
        weightedExercises: [] as string[],
        bodyweightExerciseList: [] as string[],
        durationExerciseList: [] as string[],
        heaviestLift: null as { exercise: string; weight: number } | null,
        bodyweightExercises: new Set<string>(),
        durationExercises: new Set<string>(),
      };
    }

    const counts: Record<string, number> = {};
    const maxW: Record<string, number> = {};
    const maxR: Record<string, number> = {};
    const maxD: Record<string, number> = {};
    const exerciseHistory: Record<string, { date: string; score: number }[]> = {};
    const bodyweightExerciseSet = new Set<string>();
    const durationExerciseSet = new Set<string>();
    let heaviest: { exercise: string; weight: number } | null = null;
    const workoutTypeCounts: Record<string, number> = {};
    const workoutTypeLastDate: Record<string, number> = {};

    workouts.forEach((workout) => {
      const date = toDateObj(workout.date);
      const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;

      if (workout.name) {
        workoutTypeCounts[workout.name] = (workoutTypeCounts[workout.name] || 0) + 1;
        workoutTypeLastDate[workout.name] = date.getTime();
      }

      (workout.performedExercises ?? []).forEach((performedExercise) => {
        const name = exerciseLabel(performedExercise).trim();
        if (!name) return;

        counts[name] = (counts[name] || 0) + 1;
        if (performedExercise.sets.some((set) => set.bodyweight)) bodyweightExerciseSet.add(name);
        if (isDurationExercise(performedExercise)) durationExerciseSet.add(name);
        if (!exerciseHistory[name]) exerciseHistory[name] = [];

        performedExercise.sets.forEach((set) => {
          const isDuration = set.durationSeconds !== undefined && set.reps === undefined;

          if (isDuration) {
            maxD[name] = Math.max(maxD[name] || 0, set.durationSeconds ?? 0);
          } else {
            maxW[name] = Math.max(maxW[name] || 0, set.weight ?? 0);
            if (set.bodyweight) maxR[name] = Math.max(maxR[name] || 0, set.reps ?? 0);
            if (
              !set.bodyweight &&
              (set.weight ?? 0) > 0 &&
              (!heaviest || (set.weight ?? 0) > heaviest.weight)
            ) {
              heaviest = { exercise: name, weight: set.weight ?? 0 };
            }
          }

          const score = isDuration
            ? set.durationSeconds ?? 0
            : set.bodyweight
              ? set.reps ?? 0
              : (set.weight ?? 0) * (1 + (set.reps ?? 0) / 30);
          const existingDay = exerciseHistory[name].find((history) => history.date === dateLabel);
          if (existingDay) {
            existingDay.score = Math.max(existingDay.score, score);
          } else {
            exerciseHistory[name].push({ date: dateLabel, score });
          }
        });
      });
    });

    let favorite: string | null = null;
    let maxCount = 0;
    Object.entries(counts).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        favorite = name;
      }
    });

    let favoriteType: string | null = null;
    let maxTypeCount = 0;
    let maxTypeDate = 0;
    Object.entries(workoutTypeCounts).forEach(([name, count]) => {
      const lastDate = workoutTypeLastDate[name] || 0;
      if (count > maxTypeCount || (count === maxTypeCount && lastDate > maxTypeDate)) {
        maxTypeCount = count;
        maxTypeDate = lastDate;
        favoriteType = name;
      }
    });

    const allExerciseNames = Object.keys(counts).sort();
    const weighted = allExerciseNames.filter(
      (name) => !bodyweightExerciseSet.has(name) && !durationExerciseSet.has(name)
    );
    const bodyweight = allExerciseNames.filter((name) => bodyweightExerciseSet.has(name));
    const duration = allExerciseNames.filter((name) => durationExerciseSet.has(name));
    const targetExercise = selectedExercise || favorite;
    let data = null;

    if (targetExercise && exerciseHistory[targetExercise] && exerciseHistory[targetExercise].length > 1) {
      const history = exerciseHistory[targetExercise];
      const labelCount = Math.min(MAX_CHART_LABELS, history.length);
      const shownIndices = new Set(
        Array.from({ length: labelCount }, (_, index) =>
          Math.round((index * (history.length - 1)) / (labelCount - 1))
        )
      );
      data = {
        labels: history.map((historyItem, index) => (shownIndices.has(index) ? historyItem.date : '')),
        datasets: [{ data: history.map((historyItem) => historyItem.score) }],
      };
    }

    return {
      favoriteExercise: favorite,
      favoriteWorkoutType: favoriteType,
      maxWeights: maxW,
      maxReps: maxR,
      maxDuration: maxD,
      chartData: data,
      allExercises: allExerciseNames,
      weightedExercises: weighted,
      bodyweightExerciseList: bodyweight,
      durationExerciseList: duration,
      heaviestLift: heaviest,
      bodyweightExercises: bodyweightExerciseSet,
      durationExercises: durationExerciseSet,
    };
  }, [workouts, selectedExercise]);

  useEffect(() => {
    if (!selectedExercise && favoriteExercise) setSelectedExercise(favoriteExercise);
    if (!selectedMaxExercise && weightedExercises.length > 0) setSelectedMaxExercise(weightedExercises[0]);
    if (!selectedMaxRepsExercise && bodyweightExerciseList.length > 0) {
      setSelectedMaxRepsExercise(bodyweightExerciseList[0]);
    }
    if (!selectedLongestDurationExercise && durationExerciseList.length > 0) {
      setSelectedLongestDurationExercise(durationExerciseList[0]);
    }
  }, [
    favoriteExercise,
    selectedExercise,
    selectedMaxExercise,
    selectedMaxRepsExercise,
    selectedLongestDurationExercise,
    weightedExercises,
    bodyweightExerciseList,
    durationExerciseList,
  ]);

  const chartWidth = Math.max(244, Math.min(width - 40, 720) - 36);
  const strengthDescription = selectedExercise && durationExercises.has(selectedExercise)
    ? 'Max set duration in seconds over time'
    : selectedExercise && bodyweightExercises.has(selectedExercise)
      ? 'Max reps per session over time'
      : 'Estimated 1RM over time';
  const strengthUnit = selectedExercise && durationExercises.has(selectedExercise)
    ? 'seconds'
    : selectedExercise && bodyweightExercises.has(selectedExercise)
      ? 'repetitions'
      : 'estimated pounds';
  const latestChartValue = chartData?.datasets[0]?.data.at(-1);

  const header = (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>Analytics</Text>
      <Text style={styles.pageSubtitle}>Your training, at a glance.</Text>
    </View>
  );

  if (loading && workouts.length === 0) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          styles.stateContent,
          { paddingTop: Math.max(insets.top + 18, 36) },
        ]}>
        {header}
        <View style={styles.statePanel} accessibilityRole="progressbar" accessibilityLabel="Loading analytics">
          <ActivityIndicator color="#e54242" size="large" />
          <Text style={styles.stateTitle}>Loading your numbers</Text>
          <Text style={styles.stateMessage}>We’re gathering your workout history.</Text>
        </View>
      </ScrollView>
    );
  }

  if (fetchError && workouts.length === 0) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          styles.stateContent,
          { paddingTop: Math.max(insets.top + 18, 36) },
        ]}>
        {header}
        <View style={styles.statePanel}>
          <Ionicons name="cloud-offline-outline" size={34} color="#e54242" />
          <Text style={styles.stateTitle} selectable>Couldn’t load analytics</Text>
          <Text style={styles.stateMessage} selectable>Check your connection, then try again.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading analytics"
            onPress={fetchWorkouts}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Ionicons name="refresh" size={19} color="#fff" />
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top + 18, 36), paddingBottom: Math.max(insets.bottom + 40, 64) },
      ]}>
      {header}

      {fetchError && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Workout history could not be refreshed. Retry."
          onPress={fetchWorkouts}
          style={({ pressed }) => [styles.inlineError, pressed && styles.buttonPressed]}>
          <Ionicons name="alert-circle-outline" size={21} color="#e54242" />
          <Text style={styles.inlineErrorText} selectable>Couldn’t refresh workout history. Tap to retry.</Text>
        </Pressable>
      )}

      {workouts.length === 0 ? (
        <View style={styles.statePanel}>
          <View style={styles.emptyIcon}>
            <Ionicons name="stats-chart" size={30} color="#e54242" />
          </View>
          <Text style={styles.stateTitle} selectable>Your progress starts with one workout</Text>
          <Text style={styles.stateMessage} selectable>
            Log a session and Timber will turn it into records, trends, and muscle insights.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a workout"
            accessibilityHint="Opens the workout logger"
            onPress={() => router.push('/active-workout')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>Start a workout</Text>
            <Ionicons name="arrow-forward" size={19} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <MuscleInsightCards workouts={workouts} />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.eyebrow}>ALL TIME</Text>
              <Text style={styles.sectionTitle}>Training highlights</Text>
              <Text style={styles.sectionSubtitle}>The patterns and records from every logged workout.</Text>
            </View>
            <View style={styles.groupedPanel}>
              <HighlightRow label="Favorite Workout Type" value={favoriteWorkoutType || 'Not available'} />
              <View style={styles.divider} />
              <HighlightRow label="Favorite Exercise" value={favoriteExercise || 'Not available'} />
              {heaviestLift && (
                <>
                  <View style={styles.divider} />
                  <HighlightRow
                    label="Heaviest Lift"
                    detail={heaviestLift.exercise}
                    value={`${heaviestLift.weight} lbs`}
                    numeric
                  />
                </>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.eyebrow}>PROGRESS</Text>
              <Text style={styles.sectionTitle}>Strength-O-Meter</Text>
              <Text style={styles.sectionSubtitle} selectable>{strengthDescription}</Text>
            </View>
            <View style={styles.featurePanel}>
              <Dropdown
                options={allExercises}
                value={selectedExercise}
                onSelect={setSelectedExercise}
                placeholder="Select an exercise"
                accessibilityLabel="Exercise for Strength-O-Meter"
              />

              {chartData && chartData.labels.length > 0 ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`${selectedExercise ?? 'Selected exercise'}. ${strengthDescription}. ${chartData.datasets[0].data.length} sessions shown. Latest value ${Math.round(latestChartValue ?? 0)} ${strengthUnit}.`}
                  style={styles.chartFrame}>
                  <LineChart
                    data={chartData}
                    width={chartWidth}
                    height={232}
                    chartConfig={chartConfig}
                    bezier
                    withOuterLines={false}
                    style={styles.chart}
                  />
                </View>
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="trending-up-outline" size={28} color="#6f6f6f" />
                  <Text style={styles.chartEmptyTitle} selectable>One more workout needed</Text>
                  <Text style={styles.chartEmptyText} selectable>
                    Log this exercise in at least two sessions to see progress over time.
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.eyebrow}>PERSONAL BESTS</Text>
              <Text style={styles.sectionTitle}>Your best sets</Text>
              <Text style={styles.sectionSubtitle}>Choose an exercise to see its highest recorded result.</Text>
            </View>
            <View style={styles.groupedPanel}>
              <PersonalBestRow
                label="Max Weight"
                description="Highest weight lifted"
                options={weightedExercises}
                selected={selectedMaxExercise}
                onSelect={setSelectedMaxExercise}
                value={
                  selectedMaxExercise && maxWeights[selectedMaxExercise] !== undefined
                    ? `${maxWeights[selectedMaxExercise]} lbs`
                    : null
                }
                emptyMessage="No weighted exercises logged yet."
              />

              {bodyweightExerciseList.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <PersonalBestRow
                    label="Max Reps"
                    description="Highest reps in a single set"
                    options={bodyweightExerciseList}
                    selected={selectedMaxRepsExercise}
                    onSelect={setSelectedMaxRepsExercise}
                    value={
                      selectedMaxRepsExercise && maxReps[selectedMaxRepsExercise] !== undefined
                        ? `${maxReps[selectedMaxRepsExercise]} reps`
                        : null
                    }
                    emptyMessage="No bodyweight records yet."
                  />
                </>
              )}

              {durationExerciseList.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <PersonalBestRow
                    label="Longest Duration"
                    description="Longest single set ever recorded"
                    options={durationExerciseList}
                    selected={selectedLongestDurationExercise}
                    onSelect={setSelectedLongestDurationExercise}
                    value={
                      selectedLongestDurationExercise && maxDuration[selectedLongestDurationExercise] !== undefined
                        ? formatDuration(maxDuration[selectedLongestDurationExercise])
                        : null
                    }
                    emptyMessage="No duration records yet."
                  />
                </>
              )}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function HighlightRow({
  label,
  detail,
  value,
  numeric = false,
}: {
  label: string;
  detail?: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.highlightRow} accessible accessibilityLabel={`${label}. ${detail ? `${detail}. ` : ''}${value}`}>
      <View style={styles.highlightCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        {detail && <Text style={styles.metricDetail} selectable>{detail}</Text>}
      </View>
      <Text style={[styles.highlightValue, numeric && styles.numeric]} selectable>{value}</Text>
    </View>
  );
}

function PersonalBestRow({
  label,
  description,
  options,
  selected,
  onSelect,
  value,
  emptyMessage,
}: {
  label: string;
  description: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  value: string | null;
  emptyMessage: string;
}) {
  return (
    <View style={styles.personalBestRow}>
      <View style={styles.personalBestHeader}>
        <View style={styles.personalBestCopy}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricDetail}>{description}</Text>
        </View>
        {value && <Text style={[styles.personalBestValue, styles.numeric]} selectable>{value}</Text>}
      </View>
      {options.length > 0 ? (
        <Dropdown
          options={options}
          value={selected}
          onSelect={onSelect}
          placeholder="Select an exercise"
          accessibilityLabel={`Exercise for ${label}`}
        />
      ) : (
        <Text style={styles.emptyMessage} selectable>{emptyMessage}</Text>
      )}
    </View>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 32,
  },
  stateContent: {
    flexGrow: 1,
  },
  pageHeader: {
    gap: 4,
  },
  pageTitle: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  pageSubtitle: {
    color: '#999',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
  },
  section: {
    gap: 14,
  },
  sectionHeading: {
    gap: 4,
  },
  eyebrow: {
    color: '#e56f6f',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: '#f5f5f5',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    color: '#999',
    fontSize: 16,
    lineHeight: 22,
  },
  groupedPanel: {
    overflow: 'hidden',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#181818',
  },
  featurePanel: {
    overflow: 'hidden',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#382424',
    backgroundColor: '#171717',
    padding: 18,
    gap: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#303030',
    marginHorizontal: 18,
  },
  highlightRow: {
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 18,
  },
  highlightCopy: {
    flex: 1,
    gap: 3,
  },
  metricLabel: {
    color: '#f1f1f1',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  metricDetail: {
    color: '#919191',
    fontSize: 14,
    lineHeight: 20,
  },
  highlightValue: {
    maxWidth: '53%',
    color: '#e54242',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    textAlign: 'right',
  },
  numeric: {
    fontVariant: ['tabular-nums'],
  },
  personalBestRow: {
    padding: 18,
    gap: 14,
  },
  personalBestHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  personalBestCopy: {
    flex: 1,
    gap: 3,
  },
  personalBestValue: {
    flexShrink: 0,
    color: '#e54242',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'right',
  },
  emptyMessage: {
    color: '#a0a0a0',
    fontSize: 15,
    lineHeight: 21,
  },
  chartFrame: {
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  chart: {
    borderRadius: 14,
    paddingRight: 8,
  },
  chartEmpty: {
    minHeight: 190,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  chartEmptyTitle: {
    color: '#e8e8e8',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  chartEmptyText: {
    color: '#969696',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  statePanel: {
    flex: 1,
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#3a2424',
    backgroundColor: '#1e1515',
  },
  stateTitle: {
    color: '#f2f2f2',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateMessage: {
    maxWidth: 420,
    color: '#9d9d9d',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 50,
    marginTop: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#e54242',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  inlineError: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#4a2929',
    backgroundColor: '#211616',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  inlineErrorText: {
    flex: 1,
    color: '#efb1b1',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
});
