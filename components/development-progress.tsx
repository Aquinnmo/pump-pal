import { MuscleMap } from "@/components/muscle-map";
import { MuscleMapLegend } from "@/components/muscle-map-legend";
import { muscleLabel, type MuscleId } from "@/constants/muscles";
import type { CatalogExercise, Workout } from "@/types/workout";
import { loadCatalog } from "@/utils/exercise-catalog";
import {
  computeMuscleDevelopment,
  developmentGrade,
  topDevelopmentContributors,
  type MuscleDevelopmentStat,
} from "@/utils/muscle-development";
import { muscleMapColor } from "@/utils/muscle-map-scale";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface DevelopmentProgressProps {
  workouts: Workout[];
}

function formatChange(change: number | null): string {
  if (change == null) return "Not enough history";
  if (Math.abs(change) < 0.05) return "No change";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function statusFor(change: number | null): string {
  if (change == null) return "Not enough history";
  if (Math.abs(change) < 0.05) return "No change";
  return change > 0 ? "Improving" : "Regressing";
}

function selectedAccessibility(stat: MuscleDevelopmentStat): string {
  const contributors = topDevelopmentContributors(stat.contributors)
    .map(
      (contributor) =>
        `${contributor.label}, ${formatChange(contributor.change)}`,
    )
    .join("; ");
  return `${muscleLabel(stat.muscle)}. Development grade ${stat.score == null ? "not enough history" : developmentGrade(stat.score)}. ${statusFor(stat.change)}. Performance change ${formatChange(stat.change)} in the last 90 days versus the previous 90 days.${contributors ? ` Contributing exercises: ${contributors}.` : ""}`;
}

export function DevelopmentProgress({ workouts }: DevelopmentProgressProps) {
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>("chest");
  const resultRef = useRef<ReturnType<typeof computeMuscleDevelopment> | null>(
    null,
  );

  const fetchCatalog = useCallback(async () => {
    setCatalogUnavailable(false);
    const loaded = await loadCatalog();
    if (loaded.length === 0) {
      setCatalog(null);
      setCatalogUnavailable(true);
      return;
    }
    setCatalog(loaded);
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const result = useMemo(
    () => (catalog ? computeMuscleDevelopment(workouts, catalog) : null),
    [catalog, workouts],
  );
  const statsByMuscle = useMemo(
    () => new Map(result?.muscles.map((stat) => [stat.muscle, stat]) ?? []),
    [result],
  );
  const scoresByMuscle = useMemo(
    () =>
      new Map(result?.muscles.map((stat) => [stat.muscle, stat.score]) ?? []),
    [result],
  );

  useEffect(() => {
    if (!result || resultRef.current === result) return;
    resultRef.current = result;
    setSelectedMuscle((current) => {
      if (statsByMuscle.get(current)?.score != null) return current;
      return (
        result.muscles
          .filter((stat) => stat.score != null)
          .sort(
            (left, right) =>
              Math.abs((right.score ?? 50) - 50) -
              Math.abs((left.score ?? 50) - 50),
          )[0]?.muscle ?? current
      );
    });
  }, [result, statsByMuscle]);

  const selectedStat = statsByMuscle.get(selectedMuscle) ?? {
    muscle: selectedMuscle,
    score: null,
    change: null,
    contributors: [],
  };
  const noComparableHistory =
    result != null && result.coverage.comparableSignals === 0;
  const partialCoverage = (result?.coverage.unmatchedExercises ?? 0) > 0;

  let content;
  if (catalogUnavailable) {
    content = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Exercise catalog unavailable. Retry loading Development Progress."
        onPress={fetchCatalog}
        style={({ pressed }) => [styles.stateRow, pressed && styles.pressed]}
      >
        <Ionicons name="cloud-offline-outline" size={20} color="#60a5fa" />
        <Text style={styles.stateText} selectable>
          Exercise catalog unavailable. Tap to try again.
        </Text>
      </Pressable>
    );
  } else if (result == null) {
    content = (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading Development Progress"
        style={styles.stateRow}
      >
        <ActivityIndicator color="#e54242" />
        <Text style={styles.stateText} selectable>
          Reading your training pattern
        </Text>
      </View>
    );
  } else if (noComparableHistory) {
    content = (
      <Text style={styles.stateText} selectable>
        Not enough comparable history yet. Log the same mapped exercise in both
        90-day windows to see development.
      </Text>
    );
  } else {
    content = (
      <>
        <MuscleMap
          scores={scoresByMuscle}
          selectedMuscle={selectedMuscle}
          onSelectMuscle={setSelectedMuscle}
          colorForScore={muscleMapColor}
          accessibilityLabel={`Anterior and posterior Development Progress map. Blue is regression, gray is no change, and amber is improvement. Last 90 days compared with the previous 90 days. Selected muscle: ${selectedAccessibility(selectedStat)}`}
          dropdownAccessibilityLabel="Select a muscle on the Development Progress map"
        />

        <MuscleMapLegend
          accessibilityLabel="Development Progress legend. Blue is regression at 0. Gray is no change at 50. Amber is improvement at 100."
          labels={["Regression", "No change", "Improvement"]}
        />

        {partialCoverage && (
          <View accessible accessibilityRole="text" style={styles.coverageNote}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color="#60a5fa"
            />
            <Text style={styles.coverageText} selectable>
              {result.coverage.unmatchedExercises} exercise{" "}
              {result.coverage.unmatchedExercises === 1
                ? "entry was"
                : "entries were"}{" "}
              not mapped and excluded from this comparison.
            </Text>
          </View>
        )}

        <View
          accessible
          accessibilityLabel={selectedAccessibility(selectedStat)}
          style={styles.details}
        >
          <View style={styles.snapshot}>
            <View>
              <Text style={styles.score} selectable>
                {selectedStat.score == null
                  ? "—"
                  : developmentGrade(selectedStat.score)}
              </Text>
            </View>
            <View style={styles.status}>
              <Text style={styles.statusLabel}>Performance change</Text>
              <Text style={styles.statusValue} selectable>
                {formatChange(selectedStat.change)}
              </Text>
            </View>
          </View>

          {selectedStat.contributors.length > 0 ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Contributing exercises</Text>
              {topDevelopmentContributors(selectedStat.contributors).map(
                (contributor, index) => (
                  <View
                    key={`${contributor.exerciseId}:${contributor.variationId ?? "parent"}:${contributor.metric}`}
                    style={[
                      styles.contributor,
                      index > 0 && styles.contributorDivider,
                    ]}
                  >
                    <View style={styles.contributorCopy}>
                      <Text
                        numberOfLines={1}
                        style={styles.contributorLabel}
                        selectable
                      >
                        {contributor.label}
                      </Text>
                    </View>
                    <Text style={styles.contributorChange} selectable>
                      {formatChange(contributor.change)}
                    </Text>
                  </View>
                ),
              )}
            </>
          ) : (
            <>
              <View style={styles.divider} />
              <Text style={styles.stateText} selectable>
                Not enough history for this muscle.
              </Text>
            </>
          )}
        </View>
      </>
    );
  }

  return <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 16,
    gap: 16,
  },
  header: { gap: 4 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 22 },
  subtitle: { color: "#888", fontSize: 14, fontWeight: "500", lineHeight: 20 },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
  },
  stateText: {
    flex: 1,
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  pressed: { opacity: 0.8 },
  coverageNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.24)",
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderRadius: 10,
    padding: 12,
  },
  coverageText: {
    flex: 1,
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  details: { gap: 16 },
  snapshot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  score: {
    color: "#f59e0b",
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.9,
    lineHeight: 44,
  },
  scoreCaption: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  status: { alignItems: "flex-end", gap: 4 },
  statusLabel: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  statusValue: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    lineHeight: 21,
  },
  statusDetail: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  divider: { height: 1, backgroundColor: "#2a2a2a" },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  contributor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  contributorDivider: { borderTopWidth: 1, borderTopColor: "#2a2a2a" },
  contributorCopy: { flex: 1, gap: 4 },
  contributorLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  contributorDetail: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  contributorChange: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
