import {
  analyzeSetConsistency,
  SET_CHANGE_BUCKET_ORDER,
  type SetChangeBucket,
} from "@/lib/set-consistency";
import type { Workout } from "@/types/workout";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  StatHelp,
  StatHelpFormula,
  StatHelpText,
} from "@/ui/primitives/stat-help";

const HELP = (
  <>
    <StatHelpText>
      How your weight and reps change from one set to the next as you are doing an exercise. Tracked over your last
      30 workouts.
    </StatHelpText>
    <StatHelpFormula>
      Change = (this set − last set) ÷ the smaller of the two
    </StatHelpFormula>
    <StatHelpText>
      Weight counts first. If the weight stays the same, reps decide.
    </StatHelpText>
    <StatHelpText>
      If 8 in 10 sets stay about the same, you are consistent.
    </StatHelpText>
  </>
);

type SetConsistencySummaryProps = {
  workouts: Workout[];
};

const BUCKET_COPY: Record<
  SetChangeBucket,
  { title: string; pattern: string }
> = {
  bigDrop: {
    title: "Overconfident",
    pattern: "you often overreached and dropped the weight hard",
  },
  minorDrop: {
    title: "Hitting Failure",
    pattern: "you often hit failure and eased off",
  },
  held: {
    title: "Consistent",
    pattern: "you stayed consistent",
  },
  minorSpike: {
    title: "Holding Back",
    pattern: "you often had a bit more in the tank",
  },
  bigSpike: {
    title: "Underconfident",
    pattern: "you often had far more in the tank",
  },
};


export function SetConsistencySummary({
  workouts,
}: SetConsistencySummaryProps) {
  const result = useMemo(() => analyzeSetConsistency(workouts), [workouts]);
  const copy = result.category ? BUCKET_COPY[result.category] : null;

  if (!copy) {
    const detail =
      "Log more multi-set exercises to reveal how your weight and reps change.";
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View
            style={styles.headerMain}
            accessible
            accessibilityLabel={`Set consistency. Not enough data. ${detail}`}
          >
            <Text style={styles.label} selectable>
              Set consistency
            </Text>
            <Text style={styles.value} selectable>
              Not enough data
            </Text>
          </View>
          <StatHelp title="Set consistency">{HELP}</StatHelp>
        </View>
        <View style={styles.divider} />
        <Text
          style={styles.detail}
          selectable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {detail}
        </Text>
      </View>
    );
  }

  const detail = `Across ${result.eligibleEntries} set-to-set ${result.eligibleEntries === 1 ? "change" : "changes"} in your last ${result.analyzedWorkouts} ${result.analyzedWorkouts === 1 ? "workout" : "workouts"}, ${copy.pattern}.`;

  const peak = Math.max(
    ...SET_CHANGE_BUCKET_ORDER.map((bucket) => result.distribution[bucket]),
  );
  const spokenDistribution = SET_CHANGE_BUCKET_ORDER.map(
    (bucket) =>
      `${result.distribution[bucket]} ${BUCKET_COPY[bucket].title.toLowerCase()}`,
  ).join(", ");

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View
          style={styles.headerMain}
          accessible
          accessibilityLabel={`Set consistency. ${copy.title}. ${detail} By set change: ${spokenDistribution}.`}
        >
          <Text style={styles.label} selectable>
            Set consistency
          </Text>
          <Text style={styles.value} selectable>
            {copy.title}
          </Text>
        </View>
        <StatHelp title="Set consistency">{HELP}</StatHelp>
      </View>
      <View style={styles.divider} />
      <View
        style={styles.graph}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.chart}>
          {SET_CHANGE_BUCKET_ORDER.map((bucket) => {
            const count = result.distribution[bucket];
            return (
              <View key={bucket} style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    count === 0 && styles.barEmpty,
                    { height: `${peak > 0 ? (count / peak) * 100 : 0}%` },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>Dropping volume</Text>
          <View style={styles.axisLine} />
          <Text style={styles.axisLabel}>Adding volume</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: 88,
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#1c1c1c",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  graph: {
    gap: 12,
  },
  label: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    lineHeight: 17 * 1.2,
    fontWeight: "700",
  },
  detail: {
    color: "#888",
    fontSize: 14,
    lineHeight: 14 * 1.4,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2a2a2a",
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  barTrack: {
    flex: 1,
    height: 76,
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    minHeight: 2,
    borderRadius: 3,
    backgroundColor: "#e54242",
  },
  barEmpty: {
    backgroundColor: "#2a2a2a",
  },
  axis: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  axisLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2a2a2a",
  },
  axisLabel: {
    color: "#888",
    fontSize: 11,
    lineHeight: 11 * 1.3,
    fontWeight: "600",
  },
  value: {
    maxWidth: "42%",
    color: "#e54242",
    fontSize: 18,
    lineHeight: 18 * 1.2,
    fontWeight: "700",
    textAlign: "right",
  },
});
