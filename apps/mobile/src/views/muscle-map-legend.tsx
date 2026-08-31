import { MUSCLE_MAP_SCALE } from "@/lib/muscle-map-scale";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

interface MuscleMapLegendProps {
  accessibilityLabel: string;
  labels: readonly [string, string, string];
}

const GRADIENT_COLORS = [
  MUSCLE_MAP_SCALE.low,
  MUSCLE_MAP_SCALE.middle,
  MUSCLE_MAP_SCALE.high,
] as const;

/** Continuous data scale with fixed low, midpoint, and high color anchors. */
export function MuscleMapLegend({
  accessibilityLabel,
  labels,
}: MuscleMapLegendProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.legend}
    >
      <LinearGradient
        colors={GRADIENT_COLORS}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.track}
      />
      <View style={styles.labels}>
        {labels.map((label, index) => (
          <Text
            key={label}
            numberOfLines={1}
            style={[
              styles.label,
              index === 1 && styles.middleLabel,
              index === 2 && styles.lastLabel,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { gap: 8 },
  track: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  labels: { flexDirection: "row" },
  label: {
    width: "33.333%",
    color: "#888",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  middleLabel: { textAlign: "center" },
  lastLabel: { textAlign: "right" },
});
