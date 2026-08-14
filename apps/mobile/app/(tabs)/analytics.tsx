import { useAuth } from "@/context/auth-context";
import { workoutRepository } from "@/data/workout-repository";
import { useDataVersion } from "@/hooks/use-data-version";
import { useAIEnabled } from "@/lib/use-ai-enabled";
import {
  exerciseLabel,
  isDurationExercise,
  toDateObj,
} from "@/lib/workout-conversion";
import { Workout } from "@/types/workout";
import { DevelopmentProgressSummary } from "@/ui/development-progress-summary";
import { MuscleInsightCards } from "@/ui/muscle-insight-cards";
import { MuscleLoadSummary } from "@/ui/muscle-load-summary";
import { Dropdown } from "@/ui/primitives/dropdown";
import { SetConsistencySummary } from "@/ui/set-consistency-summary";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAX_CHART_LABELS = 4;
const CHART_Y_AXIS_GUTTER = 46;
const FADE_HEIGHT = 24;
const SCROLL_EDGE_THRESHOLD = 4;

/**
 * Picks the exercise with the highest recorded value, so a personal-best row
 * opens on the user's best lift rather than whatever sorts first alphabetically.
 * Ties keep the earlier name, which is alphabetical since the lists are sorted.
 */
function highestOf(names: string[], values: Record<string, number>): string {
  return names.reduce((best, name) =>
    (values[name] ?? -Infinity) > (values[best] ?? -Infinity) ? name : best,
  );
}

type StrengthHistoryPoint = {
  dateLabel: string;
  timestamp: number;
  estimatedOneRepMax: number;
};

const chartConfig = {
  backgroundColor: "#171717",
  backgroundGradientFrom: "#171717",
  backgroundGradientTo: "#171717",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(229, 66, 66, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(194, 194, 194, ${opacity})`,
  propsForBackgroundLines: {
    stroke: "#2b2b2b",
    strokeDasharray: "",
  },
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: "#0f0f0f",
  },
  propsForLabels: {
    fontSize: 13,
  },
  propsForHorizontalLabels: {
    fill: "#969696",
    fontSize: 12,
  },
  propsForVerticalLabels: {
    fill: "#858585",
    fontSize: 12,
  },
};

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const aiEnabled = useAIEnabled();
  const { width } = useWindowDimensions();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMaxExercise, setSelectedMaxExercise] = useState<string | null>(
    null,
  );
  const [selectedMaxRepsExercise, setSelectedMaxRepsExercise] = useState<
    string | null
  >(null);
  const [selectedLongestDurationExercise, setSelectedLongestDurationExercise] =
    useState<string | null>(null);

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

  const {
    favoriteExercise,
    favoriteWorkoutType,
    maxWeights,
    maxReps,
    maxDuration,
    weightedExercises,
    bodyweightExerciseList,
    durationExerciseList,
    heaviestLift,
    strengthHistories,
    eligibleStrengthExercises,
  } = useMemo(() => {
    if (workouts.length === 0) {
      return {
        favoriteExercise: null as string | null,
        favoriteWorkoutType: null as string | null,
        maxWeights: {} as Record<string, number>,
        maxReps: {} as Record<string, number>,
        maxDuration: {} as Record<string, number>,
        weightedExercises: [] as string[],
        bodyweightExerciseList: [] as string[],
        durationExerciseList: [] as string[],
        heaviestLift: null as { exercise: string; weight: number } | null,
        strengthHistories: {} as Record<string, StrengthHistoryPoint[]>,
        eligibleStrengthExercises: [] as string[],
      };
    }

    const counts: Record<string, number> = {};
    const maxW: Record<string, number> = {};
    const maxR: Record<string, number> = {};
    const maxD: Record<string, number> = {};
    const strengthHistoryByDay: Record<
      string,
      Record<string, StrengthHistoryPoint>
    > = {};
    const bodyweightExerciseSet = new Set<string>();
    const durationExerciseSet = new Set<string>();
    let heaviest: { exercise: string; weight: number } | null = null;
    const workoutTypeCounts: Record<string, number> = {};
    const workoutTypeLastDate: Record<string, number> = {};

    workouts.forEach((workout) => {
      const date = toDateObj(workout.date);
      if (!date) return;
      const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
      const dayKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

      if (workout.name) {
        workoutTypeCounts[workout.name] =
          (workoutTypeCounts[workout.name] || 0) + 1;
        workoutTypeLastDate[workout.name] = date.getTime();
      }

      (workout.performedExercises ?? []).forEach((performedExercise) => {
        const name = exerciseLabel(performedExercise).trim();
        if (!name) return;

        counts[name] = (counts[name] || 0) + 1;
        if (performedExercise.sets.some((set) => set.bodyweight))
          bodyweightExerciseSet.add(name);
        if (isDurationExercise(performedExercise))
          durationExerciseSet.add(name);

        performedExercise.sets.forEach((set) => {
          const isDuration =
            set.durationSeconds !== undefined && set.reps === undefined;

          if (isDuration) {
            maxD[name] = Math.max(maxD[name] || 0, set.durationSeconds ?? 0);
          } else {
            maxW[name] = Math.max(maxW[name] || 0, set.weight ?? 0);
            if (set.bodyweight)
              maxR[name] = Math.max(maxR[name] || 0, set.reps ?? 0);
            if (
              !set.bodyweight &&
              (set.weight ?? 0) > 0 &&
              (!heaviest || (set.weight ?? 0) > heaviest.weight)
            ) {
              heaviest = { exercise: name, weight: set.weight ?? 0 };
            }
          }

          const weight = set.weight ?? 0;
          const reps = set.reps ?? 0;
          const isValidWeightedSet =
            !isDuration &&
            !set.bodyweight &&
            Number.isFinite(weight) &&
            Number.isFinite(reps) &&
            weight > 0 &&
            reps > 0;
          if (!isValidWeightedSet) return;

          const estimatedOneRepMax = weight * (1 + reps / 30);
          if (!strengthHistoryByDay[name]) strengthHistoryByDay[name] = {};
          const existingDay = strengthHistoryByDay[name][dayKey];
          if (
            !existingDay ||
            estimatedOneRepMax > existingDay.estimatedOneRepMax
          ) {
            strengthHistoryByDay[name][dayKey] = {
              dateLabel,
              timestamp: date.getTime(),
              estimatedOneRepMax,
            };
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
      if (
        count > maxTypeCount ||
        (count === maxTypeCount && lastDate > maxTypeDate)
      ) {
        maxTypeCount = count;
        maxTypeDate = lastDate;
        favoriteType = name;
      }
    });

    const allExerciseNames = Object.keys(counts).sort();
    const weighted = allExerciseNames.filter(
      (name) =>
        !bodyweightExerciseSet.has(name) && !durationExerciseSet.has(name),
    );
    const bodyweight = allExerciseNames.filter((name) =>
      bodyweightExerciseSet.has(name),
    );
    const duration = allExerciseNames.filter((name) =>
      durationExerciseSet.has(name),
    );
    const strengthHistories = Object.fromEntries(
      Object.entries(strengthHistoryByDay).map(([name, historyByDay]) => [
        name,
        Object.values(historyByDay).sort((a, b) => a.timestamp - b.timestamp),
      ]),
    ) as Record<string, StrengthHistoryPoint[]>;
    const eligibleStrengthExercises = Object.keys(strengthHistories)
      .filter((name) => strengthHistories[name].length >= 2)
      .sort();

    return {
      favoriteExercise: favorite,
      favoriteWorkoutType: favoriteType,
      maxWeights: maxW,
      maxReps: maxR,
      maxDuration: maxD,
      weightedExercises: weighted,
      bodyweightExerciseList: bodyweight,
      durationExerciseList: duration,
      heaviestLift: heaviest,
      strengthHistories,
      eligibleStrengthExercises,
    };
  }, [workouts]);

  const defaultStrengthExercise =
    heaviestLift && eligibleStrengthExercises.includes(heaviestLift.exercise)
      ? heaviestLift.exercise
      : (eligibleStrengthExercises[0] ?? null);
  const activeStrengthExercise =
    selectedExercise && eligibleStrengthExercises.includes(selectedExercise)
      ? selectedExercise
      : defaultStrengthExercise;
  const strengthHistory = activeStrengthExercise
    ? strengthHistories[activeStrengthExercise]
    : null;
  const strengthChartData = useMemo(() => {
    if (!strengthHistory) return null;

    const labelCount = Math.min(MAX_CHART_LABELS, strengthHistory.length);
    const shownIndices = new Set(
      Array.from({ length: labelCount }, (_, index) =>
        Math.round((index * (strengthHistory.length - 1)) / (labelCount - 1)),
      ),
    );
    return {
      labels: strengthHistory.map(() => ""),
      dateLabels: strengthHistory
        .filter((_, index) => shownIndices.has(index))
        .map((historyItem) => historyItem.dateLabel),
      datasets: [
        {
          data: strengthHistory.map(
            (historyItem) => historyItem.estimatedOneRepMax,
          ),
        },
      ],
    };
  }, [strengthHistory]);
  const strengthSummary = useMemo(() => {
    if (!strengthHistory) return null;

    const current = strengthHistory.at(-1)!;
    const record = strengthHistory.reduce(
      (best, point) =>
        point.estimatedOneRepMax > best.estimatedOneRepMax ? point : best,
      strengthHistory[0],
    );
    return {
      current,
      record,
      change:
        current.estimatedOneRepMax - strengthHistory[0].estimatedOneRepMax,
    };
  }, [strengthHistory]);

  useEffect(() => {
    if (selectedExercise !== activeStrengthExercise)
      setSelectedExercise(activeStrengthExercise);
    if (!selectedMaxExercise && weightedExercises.length > 0)
      setSelectedMaxExercise(highestOf(weightedExercises, maxWeights));
    if (!selectedMaxRepsExercise && bodyweightExerciseList.length > 0) {
      setSelectedMaxRepsExercise(highestOf(bodyweightExerciseList, maxReps));
    }
    if (!selectedLongestDurationExercise && durationExerciseList.length > 0) {
      setSelectedLongestDurationExercise(
        highestOf(durationExerciseList, maxDuration),
      );
    }
  }, [
    selectedExercise,
    activeStrengthExercise,
    selectedMaxExercise,
    selectedMaxRepsExercise,
    selectedLongestDurationExercise,
    weightedExercises,
    bodyweightExerciseList,
    durationExerciseList,
    maxWeights,
    maxReps,
    maxDuration,
  ]);

  const chartWidth = Math.max(240, Math.min(width - 40, 720) - 36);

  if (loading && workouts.length === 0) {
    return (
      <AnalyticsLayout stateContent>
        <View
          style={styles.statePanel}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading analytics"
        >
          <ActivityIndicator color="#e54242" size="large" />
          <Text style={styles.stateTitle}>Crunching your numbers</Text>
          <Text style={styles.stateMessage}>
            We’re gathering your workout history.
          </Text>
        </View>
      </AnalyticsLayout>
    );
  }

  if (fetchError && workouts.length === 0) {
    return (
      <AnalyticsLayout stateContent>
        <View style={styles.statePanel}>
          <Ionicons name="cloud-offline-outline" size={34} color="#e54242" />
          <Text style={styles.stateTitle} selectable>
            Couldn’t load analytics
          </Text>
          <Text style={styles.stateMessage} selectable>
            Check your connection, then try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading analytics"
            onPress={fetchWorkouts}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="refresh" size={19} color="#fff" />
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout>
      {fetchError && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Workout history could not be refreshed. Retry."
          onPress={fetchWorkouts}
          style={({ pressed }) => [
            styles.inlineError,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="alert-circle-outline" size={21} color="#e54242" />
          <Text style={styles.inlineErrorText} selectable>
            Couldn’t refresh workout history. Tap to retry.
          </Text>
        </Pressable>
      )}

      {workouts.length === 0 ? (
        <View style={styles.statePanel}>
          <View style={styles.emptyIcon}>
            <Ionicons name="stats-chart" size={30} color="#e54242" />
          </View>
          <Text style={styles.stateTitle} selectable>
            Your progress starts with one workout
          </Text>
          <Text style={styles.stateMessage} selectable>
            Log a session and Timber will turn it into records, trends, and
            muscle load.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a workout"
            accessibilityHint="Opens the workout logger"
            onPress={() => router.push("/active-workout")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Start a workout</Text>
            <Ionicons name="arrow-forward" size={19} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <>
          {aiEnabled && (
            <View style={styles.section}>
              <MuscleInsightCards workouts={workouts} />
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Estimated 1RM</Text>
            </View>
            <View style={styles.featurePanel}>
              {strengthSummary && strengthChartData ? (
                <>
                  <Dropdown
                    options={eligibleStrengthExercises}
                    value={activeStrengthExercise}
                    onSelect={setSelectedExercise}
                    placeholder="Select an exercise"
                    accessibilityLabel="Exercise for Strength-O-Meter"
                  />

                  <View
                    accessible
                    accessibilityLabel={`Estimated 1RM summary for ${activeStrengthExercise}. Current ${formatPounds(strengthSummary.current.estimatedOneRepMax)} on ${strengthSummary.current.dateLabel}. All-time record ${formatPounds(strengthSummary.record.estimatedOneRepMax)}. Change since first session ${formatSignedPounds(strengthSummary.change)}.`}
                    style={styles.strengthSummary}
                  >
                    <View style={styles.strengthPrimaryHeader}>
                      <Text style={styles.strengthMetricLabel}>Latest</Text>
                      <Text style={styles.strengthCurrentDetail} selectable>
                        {strengthSummary.current.dateLabel}
                      </Text>
                    </View>
                    <Text style={styles.strengthCurrentValue} selectable>
                      {formatPounds(strengthSummary.current.estimatedOneRepMax)}
                    </Text>
                    <View style={styles.strengthSecondaryMetrics}>
                      <View style={styles.strengthSecondaryMetric}>
                        <Text style={styles.strengthMetricLabel}>
                          Personal record
                        </Text>
                        <Text
                          style={[styles.strengthSecondaryValue]}
                          selectable
                        >
                          {formatPounds(
                            strengthSummary.record.estimatedOneRepMax,
                          )}
                        </Text>
                        <Text style={styles.strengthMetricDetail} selectable>
                          {strengthSummary.record.dateLabel}
                        </Text>
                      </View>
                      <View style={styles.strengthMetricDivider} />
                      <View style={styles.strengthSecondaryMetric}>
                        <Text style={styles.strengthMetricLabel}>Progress</Text>
                        <Text
                          style={[
                            styles.strengthSecondaryValue,
                            strengthSummary.change > 0 &&
                              styles.strengthPositiveValue,
                            strengthSummary.change < 0 &&
                              styles.strengthNegativeValue,
                          ]}
                          selectable
                        >
                          {formatSignedPounds(strengthSummary.change)}
                        </Text>
                        <Text style={styles.strengthMetricDetail} selectable>
                          Since first session
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.chartSection}>
                    <View
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel={`${activeStrengthExercise}. Estimated 1RM trend across ${strengthChartData.datasets[0].data.length} logged days. Current ${formatPounds(strengthSummary.current.estimatedOneRepMax)}. Record ${formatPounds(strengthSummary.record.estimatedOneRepMax)}. Change since first session ${formatSignedPounds(strengthSummary.change)}.`}
                      style={styles.chartContent}
                    >
                      <View style={styles.chartHeading}>
                        <Text style={styles.chartTitle}>Lift history</Text>
                        <Text style={styles.chartUnit} selectable>
                          lbs
                        </Text>
                      </View>
                      <View style={styles.chartFrame}>
                        <LineChart
                          data={strengthChartData}
                          width={chartWidth}
                          height={208}
                          chartConfig={chartConfig}
                          withOuterLines={false}
                          withVerticalLines={false}
                          withVerticalLabels={false}
                          yLabelsOffset={6}
                          segments={3}
                          style={styles.chart}
                        />
                      </View>
                      <View style={styles.chartDateLabels}>
                        {strengthChartData.dateLabels.map((label, index) => (
                          <Text
                            key={`${label}-${index}`}
                            selectable
                            numberOfLines={1}
                            style={[
                              styles.chartDateLabel,
                              index === 0 && styles.chartDateLabelFirst,
                              index ===
                                strengthChartData.dateLabels.length - 1 &&
                                styles.chartDateLabelLast,
                            ]}
                          >
                            {label}
                          </Text>
                        ))}
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.strengthEmpty}>
                  <Ionicons
                    name="trending-up-outline"
                    size={28}
                    color="#6f6f6f"
                  />
                  <Text style={styles.strengthEmptyTitle} selectable>
                    Build your Strength-O-Meter
                  </Text>
                  <Text style={styles.strengthEmptyText} selectable>
                    Log valid weighted sets for the same exercise on two
                    different days to unlock its estimated 1RM trend.
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Your Body</Text>
            </View>
            <View style={styles.bodyNavigationPanel}>
              <MuscleLoadSummary workouts={workouts} />
              <View style={styles.bodyNavigationDivider} />
              <DevelopmentProgressSummary workouts={workouts} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>The All Timers</Text>
            </View>
            <View style={styles.groupedPanel}>
              <HighlightRow
                label="Favorite Workout Type"
                value={favoriteWorkoutType || "Not available"}
              />
              <View style={styles.divider} />
              <HighlightRow
                label="Favorite Exercise"
                value={favoriteExercise || "Not available"}
              />
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
              <Text style={styles.sectionTitle}>Consistency</Text>
            </View>
            <SetConsistencySummary workouts={workouts} />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Simply the Best</Text>
            </View>
            <View style={styles.groupedPanel}>
              <PersonalBestRow
                label="Max Weight"
                options={weightedExercises}
                selected={selectedMaxExercise}
                onSelect={setSelectedMaxExercise}
                value={
                  selectedMaxExercise &&
                  maxWeights[selectedMaxExercise] !== undefined
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
                    options={bodyweightExerciseList}
                    selected={selectedMaxRepsExercise}
                    onSelect={setSelectedMaxRepsExercise}
                    value={
                      selectedMaxRepsExercise &&
                      maxReps[selectedMaxRepsExercise] !== undefined
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
                    options={durationExerciseList}
                    selected={selectedLongestDurationExercise}
                    onSelect={setSelectedLongestDurationExercise}
                    value={
                      selectedLongestDurationExercise &&
                      maxDuration[selectedLongestDurationExercise] !== undefined
                        ? formatDuration(
                            maxDuration[selectedLongestDurationExercise],
                          )
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
    </AnalyticsLayout>
  );
}

function AnalyticsLayout({
  children,
  stateContent = false,
}: {
  children: ReactNode;
  stateContent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateFades = () => {
    const hasOverflow =
      contentHeightRef.current >
      layoutHeightRef.current + SCROLL_EDGE_THRESHOLD;
    const nextTopFade =
      hasOverflow && scrollYRef.current > SCROLL_EDGE_THRESHOLD;
    const nextBottomFade =
      hasOverflow &&
      scrollYRef.current + layoutHeightRef.current <
        contentHeightRef.current - SCROLL_EDGE_THRESHOLD;

    setShowTopFade((current) =>
      current === nextTopFade ? current : nextTopFade,
    );
    setShowBottomFade((current) =>
      current === nextBottomFade ? current : nextBottomFade,
    );
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.fixedHeader,
          { paddingTop: Math.max(insets.top + 18, 36) },
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.pageTitle}>Analytics</Text>
        </View>
      </View>

      <View
        style={styles.scrollWrapper}
        onLayout={(event) => {
          layoutHeightRef.current = event.nativeEvent.layout.height;
          updateFades();
        }}
      >
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
            updateFades();
          }}
          onContentSizeChange={(_, height) => {
            contentHeightRef.current = height;
            updateFades();
          }}
          contentContainerStyle={[
            styles.content,
            stateContent && styles.stateContent,
            {
              paddingTop: FADE_HEIGHT,
              paddingBottom: Math.max(insets.bottom + 40, 64) + FADE_HEIGHT,
            },
          ]}
        >
          {children}
        </ScrollView>

        <View
          pointerEvents="none"
          style={[styles.fadeTop, { opacity: showTopFade ? 1 : 0 }]}
        >
          <LinearGradient
            colors={["#0f0f0f", "transparent"]}
            style={styles.fadeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </View>

        <View
          pointerEvents="none"
          style={[styles.fadeBottom, { opacity: showBottomFade ? 1 : 0 }]}
        >
          <LinearGradient
            colors={["transparent", "#0f0f0f"]}
            style={styles.fadeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </View>
      </View>
    </View>
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
    <View
      style={styles.highlightRow}
      accessible
      accessibilityLabel={`${label}. ${detail ? `${detail}. ` : ""}${value}`}
    >
      <View style={styles.highlightCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        {detail && (
          <Text style={styles.metricDetail} selectable>
            {detail}
          </Text>
        )}
      </View>
      <Text
        style={[styles.highlightValue, numeric && styles.numeric]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function PersonalBestRow({
  label,
  options,
  selected,
  onSelect,
  value,
  emptyMessage,
}: {
  label: string;
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
        </View>
        {value && (
          <Text style={[styles.personalBestValue, styles.numeric]} selectable>
            {value}
          </Text>
        )}
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
        <Text style={styles.emptyMessage} selectable>
          {emptyMessage}
        </Text>
      )}
    </View>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatPounds(value: number) {
  return `${Math.round(value)} lbs`;
}

function formatSignedPounds(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} lbs`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },
  fixedHeader: {
    width: "100%",
    backgroundColor: "#0f0f0f",
    paddingBottom: 8,
  },
  headerContent: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  scrollWrapper: {
    flex: 1,
    position: "relative",
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    gap: 32,
  },
  stateContent: {
    flexGrow: 1,
  },
  pageTitle: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeGradient: {
    flex: 1,
  },
  section: {
    gap: 14,
  },
  sectionHeading: {
    gap: 2,
  },
  sectionTitle: {
    color: "#f5f5f5",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    color: "#999",
    fontSize: 16,
    lineHeight: 22,
  },
  groupedPanel: {
    overflow: "hidden",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2b2b2b",
    backgroundColor: "#181818",
  },
  bodyNavigationPanel: {
    overflow: "hidden",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#1c1c1c",
  },
  bodyNavigationDivider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: "#2a2a2a",
  },
  featurePanel: {
    overflow: "hidden",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2b2b2b",
    backgroundColor: "#171717",
    padding: 18,
    gap: 18,
  },
  strengthSummary: {
    paddingHorizontal: 2,
  },
  strengthPrimaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  strengthMetricLabel: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  strengthCurrentValue: {
    color: "#e54242",
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.9,
    paddingTop: 2,
  },
  strengthCurrentDetail: {
    color: "#999",
    fontSize: 13,
    lineHeight: 18,
  },
  strengthSecondaryMetrics: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#343434",
  },
  strengthSecondaryMetric: {
    flex: 1,
    gap: 2,
  },
  strengthMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 45,
    backgroundColor: "#343434",
    marginHorizontal: 12,
  },
  strengthSecondaryValue: {
    color: "#f5f5f5",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  strengthRecordValue: {
    color: "#e54242",
  },
  strengthMetricDetail: {
    color: "#888",
    fontSize: 12,
    lineHeight: 17,
  },
  strengthPositiveValue: {
    color: "#81cf9b",
  },
  strengthNegativeValue: {
    color: "#ee8c8c",
  },
  chartSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#303030",
    paddingTop: 18,
  },
  chartContent: {
    gap: 8,
  },
  chartHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  chartTitle: {
    color: "#e8e8e8",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  chartUnit: {
    color: "#858585",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#303030",
    marginHorizontal: 18,
  },
  highlightRow: {
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 18,
  },
  highlightCopy: {
    flex: 1,
    gap: 3,
  },
  metricLabel: {
    color: "#f1f1f1",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  metricDetail: {
    color: "#919191",
    fontSize: 14,
    lineHeight: 20,
  },
  highlightValue: {
    maxWidth: "53%",
    color: "#e54242",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    textAlign: "right",
  },
  numeric: {
    fontVariant: ["tabular-nums"],
  },
  personalBestRow: {
    padding: 18,
    gap: 14,
  },
  personalBestHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  personalBestCopy: {
    flex: 1,
    gap: 3,
  },
  personalBestValue: {
    flexShrink: 0,
    color: "#e54242",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "right",
  },
  emptyMessage: {
    color: "#a0a0a0",
    fontSize: 15,
    lineHeight: 21,
  },
  chartFrame: {
    width: "100%",
    alignItems: "flex-start",
    backgroundColor: "#171717",
  },
  chart: {
    paddingTop: 24,
    paddingRight: CHART_Y_AXIS_GUTTER,
  },
  chartDateLabels: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingLeft: CHART_Y_AXIS_GUTTER,
  },
  chartDateLabel: {
    maxWidth: 72,
    color: "#858585",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  chartDateLabelFirst: {
    textAlign: "left",
  },
  chartDateLabelLast: {
    textAlign: "right",
  },
  strengthEmpty: {
    minHeight: 164,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  strengthEmptyTitle: {
    color: "#e8e8e8",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  strengthEmptyText: {
    color: "#969696",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  statePanel: {
    flex: 1,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#3a2424",
    backgroundColor: "#1e1515",
  },
  stateTitle: {
    color: "#f2f2f2",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  stateMessage: {
    maxWidth: 420,
    color: "#9d9d9d",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 50,
    marginTop: 8,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#e54242",
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.72,
  },
  inlineError: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#4a2929",
    backgroundColor: "#211616",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  inlineErrorText: {
    flex: 1,
    color: "#efb1b1",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
});
