import { MuscleMap } from "@/ui/muscle-map";
import { MuscleMapLegend } from "@/ui/muscle-map-legend";
import { muscleLabel, type MuscleId } from "@/constants/muscles";
import {
  muscleLoadPercentage,
  type MuscleLoadResult,
  type MuscleLoadStat,
} from "@/lib/muscle-load";
import { muscleMapColor } from "@/lib/muscle-map-scale";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface MuscleLoadMapProps {
  result: MuscleLoadResult;
}

function statusFor(score: number): string {
  if (score === 0) return "Not worked recently";
  if (score < 2) return "Light recent load";
  if (score < 5) return "Moderate recent load";
  return "Heavy recent load";
}

function relativeDate(timestamp: number | null): string {
  if (timestamp == null) return "Not worked in this window";
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)),
  );
  if (elapsedDays === 0) return "Today";
  if (elapsedDays === 1) return "Yesterday";
  return `${elapsedDays} days ago`;
}

function selectedAccessibility(stat: MuscleLoadStat): string {
  const exercises = stat.contributors
    .slice(0, 3)
    .map((contributor) => contributor.label)
    .join(", ");
  return `${muscleLabel(stat.muscle)}. ${muscleLoadPercentage(stat.score)} percent. ${statusFor(
    stat.score,
  )}. Last worked ${relativeDate(stat.lastWorkedAt)}.${exercises ? ` Top exercises: ${exercises}.` : ""}`;
}

export function MuscleLoadMap({ result }: MuscleLoadMapProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>("chest");
  const statsByMuscle = useMemo(
    () => new Map(result.muscles.map((stat) => [stat.muscle, stat])),
    [result],
  );
  const scoresByMuscle = useMemo(
    () =>
      new Map(
        result.muscles.map((stat) => [
          stat.muscle,
          muscleLoadPercentage(stat.score),
        ]),
      ),
    [result],
  );
  const selectedStat = statsByMuscle.get(selectedMuscle) ?? {
    muscle: selectedMuscle,
    score: 0,
    lastWorkedAt: null,
    contributors: [],
  };
  const noMappedLoad = result.muscles.every((stat) => stat.score === 0);

  return (
    <View style={styles.card}>
      <MuscleMap
        scores={scoresByMuscle}
        selectedMuscle={selectedMuscle}
        onSelectMuscle={setSelectedMuscle}
        colorForScore={muscleMapColor}
        accessibilityLabel={`Anterior and posterior muscle load map. Blue means light recent load, gray means moderate recent load, and amber means heavy recent load. Selected muscle: ${selectedAccessibility(selectedStat)}`}
        dropdownAccessibilityLabel="Select a muscle on the recent load map"
      />

      <MuscleMapLegend
        accessibilityLabel="Muscle load legend. Blue is light recent load at 0 percent. Gray is moderate recent load at 50 percent. Amber is heavy recent load at 100 percent."
        labels={["Light", "Moderate", "Heavy"]}
      />

      {noMappedLoad && (
        <Text style={styles.emptyNote} selectable>
          No mapped load in the past 7 days. The map stays blue until a
          catalog-matched set with recorded work is logged.
        </Text>
      )}

      {result.coverage.unmatchedExercises > 0 && (
        <View accessible accessibilityRole="text" style={styles.coverageNote}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color="#60a5fa"
          />
          <Text style={styles.coverageText} selectable>
            {result.coverage.unmatchedExercises} of{" "}
            {result.coverage.recentExercises} recent exercise
            {result.coverage.recentExercises === 1 ? "" : "s"} could not be
            mapped and
            {result.coverage.unmatchedExercises === 1 ? " was" : " were"}{" "}
            excluded.
          </Text>
        </View>
      )}

      <View
        accessible
        accessibilityLabel={selectedAccessibility(selectedStat)}
        style={styles.details}
      >
        <View style={styles.snapshot}>
          <Text style={styles.score} selectable>
            {muscleLoadPercentage(selectedStat.score)}%
          </Text>
          <View style={styles.lastWorked}>
            <Text style={styles.lastWorkedLabel}>Last worked</Text>
            <Text style={styles.lastWorkedValue} selectable>
              {relativeDate(selectedStat.lastWorkedAt)}
            </Text>
          </View>
        </View>

        {selectedStat.contributors.length > 0 ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Top contributors</Text>
            <View style={styles.contributors}>
              {selectedStat.contributors
                .slice(0, 3)
                .map((contributor, index) => (
                  <View
                    key={`${contributor.exerciseId}:${contributor.variationId ?? "parent"}:${contributor.label}`}
                    style={[
                      styles.contributorRow,
                      index > 0 && styles.contributorRowDivider,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={styles.contributorLabel}
                      selectable
                    >
                      {contributor.label}
                    </Text>
                    <Text style={styles.contributorScore} selectable>
                      {muscleLoadPercentage(contributor.score)}%
                    </Text>
                  </View>
                ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Text style={styles.noContributors} selectable>
              No mapped exercises contributed to this muscle in the current
              window.
            </Text>
          </>
        )}
      </View>
    </View>
  );
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
  emptyNote: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "center",
  },
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
  details: {
    gap: 16,
  },
  snapshot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  score: {
    color: "#e54242",
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.9,
    lineHeight: 44,
  },
  lastWorked: {
    alignItems: "flex-end",
    gap: 4,
  },
  lastWorkedLabel: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  lastWorkedValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a2a",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  contributors: {
    gap: 8,
  },
  contributorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 24,
  },
  contributorRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    paddingTop: 8,
  },
  contributorLabel: { flex: 1, color: "#888", fontSize: 14, fontWeight: "500" },
  contributorScore: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  noContributors: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  methodNote: {
    color: "#888",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
});
