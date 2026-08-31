import { useAuth } from "@/context/auth-context";
import { AIQuotaError, formatAIError } from "@/lib/ai-client";
import {
  analyzeMuscles,
  MuscleInsights,
  normalizeMuscleInsights,
} from "@/lib/muscle-analysis";
import { useAIGenerationAvailable } from "@/lib/use-ai-connectivity";
import { useAIQuota } from "@/lib/use-ai-quota";
import { Workout } from "@/types/workout";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
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

interface InsightsCache {
  insights: MuscleInsights;
}

export function MuscleInsightCards({ workouts }: Props) {
  const { user } = useAuth();
  const aiAvailable = useAIGenerationAvailable();
  const [insights, setInsights] = useState<MuscleInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  // The server counts AI uses across every feature, so this is the only honest
  // source for the meter — a per-card local tally drifts the moment the user
  // spends a use in the workout builder.
  const { usesLeft } = useAIQuota();
  const cacheKey = user ? `muscle_insights_${user.uid}` : null;

  useEffect(() => {
    if (workouts.length === 0 || !cacheKey) return;

    let cancelled = false;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const cached: InsightsCache = JSON.parse(raw);
        setInsights(
          (current) => current ?? normalizeMuscleInsights(cached.insights),
        );
      })
      .catch((caughtError) => {
        console.error("Could not load cached AI muscle insights:", caughtError);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, workouts.length]);

  const runAnalysis = async () => {
    if (workouts.length === 0 || !cacheKey) return;
    setLoading(true);
    setError(null);
    setQuotaExhausted(false);
    try {
      if (!aiAvailable) {
        setError("AI needs a connection. Cached insights remain available.");
        return;
      }

      // `remaining` is recorded by callAI itself, so nothing to write back here.
      const { insights: result } = await analyzeMuscles(workouts);
      setInsights(result);
      const payload: InsightsCache = { insights: result };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (caughtError) {
      if (caughtError instanceof AIQuotaError) {
        setQuotaExhausted(true);
        return;
      }
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

  const handleManualRefresh = () => {
    if (!aiAvailable || usesLeft === 0 || loading) return;
    runAnalysis();
  };

  if (workouts.length === 0) return null;

  const refreshDisabled = usesLeft === 0 || !aiAvailable;
  const refreshLabel = !aiAvailable
    ? "AI needs a connection"
    : usesLeft === 0
      ? "Daily limit reached"
      : usesLeft == null
        ? "Refresh"
        : `Refresh · ${usesLeft} left`;

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
              !aiAvailable
                ? "AI needs a connection. Cached insights remain available."
                : usesLeft === 0
                  ? "No AI uses left today."
                  : usesLeft == null
                    ? "Refresh AI muscle insights."
                    : `Refresh AI muscle insights. ${usesLeft} AI uses left today.`
            }
            accessibilityState={{ disabled: refreshDisabled }}
            style={({ pressed }) => [
              styles.refreshButton,
              refreshDisabled && styles.refreshButtonDisabled,
              pressed && !refreshDisabled && styles.buttonPressed,
            ]}
            onPress={handleManualRefresh}
            disabled={refreshDisabled || loading}
          >
            <Ionicons
              name="refresh"
              size={17}
              color={refreshDisabled ? "#6c6c6c" : "#f08a8a"}
            />
            <Text
              style={[
                styles.refreshButtonText,
                usesLeft === 0 && styles.refreshButtonTextDisabled,
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
      ) : quotaExhausted ? (
        // Deliberately not a Pressable: retrying cannot succeed until tomorrow,
        // and nothing went wrong — the user simply spent the day's uses.
        <View
          style={styles.statusPanel}
          accessible
          accessibilityLabel="Sorry, you are out of insights for today."
        >
          <Ionicons name="time-outline" size={24} color="#888" />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Out of insights</Text>
            <Text style={styles.statusText} selectable>
              Sorry, you are out of insights for today.
            </Text>
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
          onPress={handleManualRefresh}
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
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            !aiAvailable
              ? "AI needs a connection to analyze muscle fatigue."
              : usesLeft === 0
                ? "No AI uses left today."
                : usesLeft == null
                  ? "Analyze muscle fatigue."
                  : `Analyze muscle fatigue. ${usesLeft} AI credits left today.`
          }
          accessibilityState={{ disabled: refreshDisabled }}
          style={({ pressed }) => [
            styles.analyzePrompt,
            refreshDisabled && styles.analyzePromptDisabled,
            pressed && !refreshDisabled && styles.buttonPressed,
          ]}
          onPress={handleManualRefresh}
          disabled={refreshDisabled}
        >
          <Ionicons
            name="analytics-outline"
            size={24}
            color={refreshDisabled ? "#666" : "#e54242"}
          />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Analyze your muscle fatigue</Text>
            <Text style={styles.statusText} selectable>
              {!aiAvailable
                ? "AI needs a connection."
                : usesLeft === 0
                  ? "No AI uses left today."
                  : usesLeft == null
                    ? "Review the past 30 days · 1 credit"
                    : `Review the past 30 days · 1 credit (${usesLeft} left)`}
            </Text>
          </View>
          <Ionicons
            name="arrow-forward"
            size={20}
            color={refreshDisabled ? "#666" : "#888"}
          />
        </Pressable>
      )}
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
  analyzePrompt: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#1c1c1c",
    padding: 16,
    gap: 12,
  },
  analyzePromptDisabled: {
    backgroundColor: "#151515",
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
