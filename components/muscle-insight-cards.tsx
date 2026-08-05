import { TEMPORARY_AI_DAILY_LIMIT } from "@/shared/ai-contract";
import { useAuth } from "@/context/auth-context";
import { Workout } from "@/types/workout";
import { formatAIError } from "@/utils/ai-client";
import {
  analyzeMuscles,
  MuscleInsights,
  normalizeMuscleInsights,
} from "@/utils/muscle-analysis";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Props {
  workouts: Workout[];
}

const MAX_DAILY_REFRESHES = TEMPORARY_AI_DAILY_LIMIT;

interface InsightsCache {
  date: string;
  insights: MuscleInsights;
}

interface RefreshCache {
  date: string;
  count: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MuscleInsightCards({ workouts }: Props) {
  const { user } = useAuth();
  const [insights, setInsights] = useState<MuscleInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshesLeft, setRefreshesLeft] = useState(MAX_DAILY_REFRESHES);
  const hasLoadedRef = useRef(false);

  const cacheKey = user ? `muscle_insights_${user.uid}` : null;
  const refreshCountKey = user ? `muscle_insights_refreshes_${user.uid}` : null;

  useEffect(() => {
    if (!refreshCountKey) return;
    AsyncStorage.getItem(refreshCountKey).then((raw) => {
      if (!raw) return;
      const cached: RefreshCache = JSON.parse(raw);
      if (cached.date === todayKey()) {
        setRefreshesLeft(Math.max(0, MAX_DAILY_REFRESHES - cached.count));
      }
    });
  }, [refreshCountKey]);

  const runAnalysis = async (force = false) => {
    if (workouts.length === 0 || !cacheKey) return;
    setLoading(true);
    setError(null);
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const cached: InsightsCache = JSON.parse(raw);
          if (cached.date === todayKey()) {
            setInsights(normalizeMuscleInsights(cached.insights));
            return;
          }
        }
      }

      const result = await analyzeMuscles(workouts);
      setInsights(result);
      const payload: InsightsCache = { date: todayKey(), insights: result };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (caughtError) {
      const details = formatAIError(caughtError);
      console.error("AI muscle analysis failed:", details, caughtError);
      setError(
        __DEV__
          ? `AI error: ${details}`
          : "Could not load AI insights. Tap to retry.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!refreshCountKey || refreshesLeft <= 0 || loading) return;

    const raw = await AsyncStorage.getItem(refreshCountKey);
    let newCount = 1;
    if (raw) {
      const cached: RefreshCache = JSON.parse(raw);
      newCount = cached.date === todayKey() ? cached.count + 1 : 1;
    }
    await AsyncStorage.setItem(
      refreshCountKey,
      JSON.stringify({ date: todayKey(), count: newCount }),
    );
    setRefreshesLeft(Math.max(0, MAX_DAILY_REFRESHES - newCount));
    runAnalysis(true);
  };

  useEffect(() => {
    if (workouts.length > 0 && cacheKey && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      runAnalysis();
    }
    // The initial analysis is intentionally keyed to the user and workout availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts.length, cacheKey]);

  if (workouts.length === 0) return null;

  const refreshLabel =
    refreshesLeft > 0
      ? `Refresh · ${refreshesLeft} left`
      : "Daily limit reached";

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>AI INSIGHTS</Text>
          <Text style={styles.sectionTitle}>Muscle Fatigue</Text>
          <Text style={styles.sectionSubtitle} selectable>
            Past 30 days
          </Text>
        </View>
        {insights && !loading && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              refreshesLeft > 0
                ? `Refresh AI muscle insights. ${refreshesLeft} refreshes left today.`
                : "AI muscle insight daily refresh limit reached."
            }
            accessibilityState={{ disabled: refreshesLeft <= 0 }}
            style={({ pressed }) => [
              styles.refreshButton,
              refreshesLeft <= 0 && styles.refreshButtonDisabled,
              pressed && refreshesLeft > 0 && styles.buttonPressed,
            ]}
            onPress={handleManualRefresh}
            disabled={refreshesLeft <= 0 || loading}
          >
            <Ionicons
              name="refresh"
              size={17}
              color={refreshesLeft <= 0 ? "#6c6c6c" : "#f08a8a"}
            />
            <Text
              style={[
                styles.refreshButtonText,
                refreshesLeft <= 0 && styles.refreshButtonTextDisabled,
              ]}
            >
              {refreshLabel}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View
          style={styles.statusPanel}
          accessibilityRole="progressbar"
          accessibilityLabel="Analyzing your workouts"
        >
          <ActivityIndicator color="#e54242" size="small" />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              Reading your training pattern
            </Text>
            <Text style={styles.statusText}>This can take a moment.</Text>
          </View>
        </View>
      ) : error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${error} Retry AI muscle insights.`}
          style={({ pressed }) => [
            styles.errorPanel,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => runAnalysis(true)}
        >
          <Ionicons name="alert-circle-outline" size={24} color="#e54242" />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Insights aren’t available</Text>
            <Text style={styles.errorText} selectable>
              {error}
            </Text>
            <Text style={styles.retryText}>Tap to try again</Text>
          </View>
        </Pressable>
      ) : insights ? (
        insights.overTrained.length === 0 &&
        insights.underTrained.length === 0 ? (
          <View
            style={styles.balancedPanel}
            accessible
            accessibilityLabel="Training looks balanced. No recovery or volume imbalances stood out in the past 30 days."
          >
            <View style={styles.balancedIconFrame}>
              <Ionicons
                name="checkmark-circle-outline"
                size={28}
                color="#73c69a"
              />
            </View>
            <View style={styles.statusCopy}>
              <Text style={styles.balancedTitle}>Training looks balanced</Text>
              <Text style={styles.balancedText} selectable>
                No recovery or volume imbalances stood out in the past 30 days.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.insightsPanel}>
            <InsightRow
              icon="medkit-outline"
              title="Over Trained"
              muscles={insights.overTrained}
              color="#e86d6d"
            />
            <View style={styles.divider} />
            <InsightRow
              icon="barbell-outline"
              title="Under Trained"
              muscles={insights.underTrained}
              color="#69b9e8"
            />
          </View>
        )
      ) : null}
    </View>
  );
}

function InsightRow({
  icon,
  title,
  muscles,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  muscles: string[];
  color: string;
}) {
  const summary = muscles.length > 0 ? muscles.join(", ") : "None detected";

  return (
    <View
      style={styles.insightRow}
      accessible
      accessibilityLabel={`${title}. ${summary}.`}
    >
      <View
        style={[
          styles.iconFrame,
          { borderColor: `${color}55`, backgroundColor: `${color}14` },
        ]}
      >
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.insightCopy}>
        <Text style={styles.insightTitle}>{title}</Text>
        <View style={styles.muscleList}>
          {muscles.length === 0 ? (
            <Text style={styles.noneText} selectable>
              No muscles detected
            </Text>
          ) : (
            muscles.map((muscle) => (
              <View key={muscle} style={styles.muscleRow}>
                <View
                  style={[styles.muscleMarker, { backgroundColor: color }]}
                />
                <Text style={styles.muscleName} selectable>
                  {muscle}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  headingCopy: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 4,
  },
  eyebrow: {
    color: "#e56f6f",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.4,
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
  refreshButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#533030",
    backgroundColor: "#211717",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  refreshButtonDisabled: {
    borderColor: "#303030",
    backgroundColor: "#181818",
  },
  refreshButtonText: {
    color: "#f08a8a",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  refreshButtonTextDisabled: {
    color: "#777",
  },
  buttonPressed: {
    opacity: 0.72,
  },
  insightsPanel: {
    overflow: "hidden",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#382727",
    backgroundColor: "#191717",
  },
  balancedPanel: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#294438",
    backgroundColor: "#17201c",
    padding: 16,
    gap: 12,
  },
  balancedIconFrame: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#3a6a53",
    backgroundColor: "#1d3027",
  },
  balancedTitle: {
    color: "#dff4e8",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  balancedText: {
    color: "#9eb9aa",
    fontSize: 15,
    lineHeight: 21,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  iconFrame: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  insightCopy: {
    flex: 1,
    gap: 8,
  },
  insightTitle: {
    color: "#f3f3f3",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
  },
  muscleList: {
    gap: 8,
  },
  muscleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  muscleMarker: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  muscleName: {
    flexShrink: 1,
    color: "#e3e3e3",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  noneText: {
    color: "#b3b3b3",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    backgroundColor: "#3a3030",
  },
  statusPanel: {
    minHeight: 108,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#382727",
    backgroundColor: "#191717",
    padding: 16,
    gap: 12,
  },
  errorPanel: {
    minHeight: 124,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#4a2929",
    backgroundColor: "#211616",
    padding: 16,
    gap: 12,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    color: "#ededed",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  statusText: {
    color: "#999",
    fontSize: 15,
    lineHeight: 21,
  },
  errorText: {
    color: "#d5a1a1",
    fontSize: 15,
    lineHeight: 21,
  },
  retryText: {
    paddingTop: 4,
    color: "#f08a8a",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
});
