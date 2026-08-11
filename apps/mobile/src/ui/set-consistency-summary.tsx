import type { Workout } from "@/types/workout";
import {
  analyzeSetConsistency,
  SET_CONSISTENCY_MIN_ENTRIES,
  type SetConsistencyCategory,
} from "@/lib/set-consistency";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type SetConsistencySummaryProps = {
  workouts: Workout[];
};

const CATEGORY_COPY: Record<
  SetConsistencyCategory,
  { title: string; pattern: string }
> = {
  consistent: {
    title: "Consistent",
    pattern: "you stayed consistent",
  },
  overconfident: {
    title: "Overconfident",
    pattern: "your weight or reps often fell",
  },
  underconfident: {
    title: "Underconfident",
    pattern: "your weight or reps often climbed",
  },
  erratic: {
    title: "Erratic",
    pattern: "you can't decide on weight and reps",
  },
};

export function SetConsistencySummary({
  workouts,
}: SetConsistencySummaryProps) {
  const result = useMemo(() => analyzeSetConsistency(workouts), [workouts]);
  const copy = result.category ? CATEGORY_COPY[result.category] : null;

  if (!copy) {
    const remaining = Math.max(
      0,
      SET_CONSISTENCY_MIN_ENTRIES - result.eligibleEntries,
    );
    const detail = `Log ${remaining} more multi-set ${remaining === 1 ? "exercise" : "exercises"} to reveal how your weight and reps change.`;
    return (
      <View
        style={styles.panel}
        accessible
        accessibilityLabel={`Set consistency. Not enough data. ${detail}`}
      >
        <View style={styles.header}>
          <Text style={styles.label} selectable>
            Set consistency
          </Text>
          <Text style={styles.value} selectable>
            Not enough data
          </Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.detail} selectable>
          {detail}
        </Text>
      </View>
    );
  }

  const detail = `Across ${result.eligibleEntries} multi-set ${result.eligibleEntries === 1 ? "exercise" : "exercises"} in your last ${result.analyzedWorkouts} ${result.analyzedWorkouts === 1 ? "workout" : "workouts"}, ${copy.pattern}.`;

  return (
    <View
      style={styles.panel}
      accessible
      accessibilityLabel={`Set consistency. ${copy.title}. ${detail}`}
    >
      <View style={styles.header}>
        <Text style={styles.label} selectable>
          Set consistency
        </Text>
        <Text style={styles.value} selectable>
          {copy.title}
        </Text>
      </View>
      <View style={styles.divider} />
      <Text style={styles.detail} selectable>
        {detail}
      </Text>
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
    justifyContent: "space-between",
    gap: 16,
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
  value: {
    maxWidth: "42%",
    color: "#e54242",
    fontSize: 18,
    lineHeight: 18 * 1.2,
    fontWeight: "700",
    textAlign: "right",
  },
});
