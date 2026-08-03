import { Dropdown } from "@/components/ui/dropdown";
import {
  BODY_SILHOUETTES,
  MUSCLE_MAP_VIEWBOX,
  MUSCLE_PEBBLES,
  muscleAtPoint,
} from "@/constants/muscle-map-paths";
import { muscleLabel, MUSCLES, type MuscleId } from "@/constants/muscles";
import {
  muscleLoadColor,
  muscleLoadPercentage,
  type MuscleLoadResult,
  type MuscleLoadStat,
} from "@/utils/muscle-load";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { G, Path } from "react-native-svg";

interface MuscleLoadMapProps {
  result: MuscleLoadResult;
}

const MUSCLE_OPTIONS = MUSCLES.map(muscleLabel);
const LOAD_LEGEND_STEPS = [0, 2, 4, 6, 8] as const;
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
  const { width } = useWindowDimensions();
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>("chest");
  const statsByMuscle = useMemo(
    () => new Map(result.muscles.map((stat) => [stat.muscle, stat])),
    [result],
  );
  const selectedStat = statsByMuscle.get(selectedMuscle) ?? {
    muscle: selectedMuscle,
    score: 0,
    lastWorkedAt: null,
    contributors: [],
  };
  const mapWidth = Math.max(232, Math.min(width - 72, 560));
  const mapHeight =
    (mapWidth * MUSCLE_MAP_VIEWBOX.height) / MUSCLE_MAP_VIEWBOX.width;
  const noMappedLoad = result.muscles.every((stat) => stat.score === 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} selectable>
          Recent muscle load
        </Text>
      </View>

      <View style={styles.viewLabels}>
        <Text style={styles.viewLabel}>Anterior</Text>
        <Text style={styles.viewLabel}>Posterior</Text>
      </View>
      <View
        accessible
        accessibilityLabel={`Anterior and posterior muscle load map. Blue means 0 percent and red means 100 percent on the fixed recent-work scale. Selected muscle: ${selectedAccessibility(
          selectedStat,
        )}`}
        style={styles.mapFrame}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Muscle map. Tap a muscle to select it."
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;
            const muscle = muscleAtPoint(
              (locationX / mapWidth) * MUSCLE_MAP_VIEWBOX.width,
              (locationY / mapHeight) * MUSCLE_MAP_VIEWBOX.height,
            );
            if (muscle) setSelectedMuscle(muscle);
          }}
          style={{ width: mapWidth, height: mapHeight }}
        >
          <Svg
            width={mapWidth}
            height={mapHeight}
            pointerEvents="none"
            viewBox={`0 0 ${MUSCLE_MAP_VIEWBOX.width} ${MUSCLE_MAP_VIEWBOX.height}`}
          >
            {BODY_SILHOUETTES.map((silhouette) => {
              const view = silhouette.view;
              return (
                <G key={view}>
                  {/* One flat-filled Path per body part, no clip and no stroke:
                    the parts overlap, so a single combined path leaves the
                    union up to the fill rule (holes where parts cross) and a
                    stroke would draw every internal seam. */}
                  {silhouette.d.split(/(?=M)/).map((part, index) => (
                    <Path
                      key={`${view}-part-${index}`}
                      d={part}
                      fill="#2b2b2b"
                    />
                  ))}
                  {MUSCLE_PEBBLES.filter((pebble) => pebble.view === view).map(
                    (pebble) => {
                      const muscle = pebble.muscle;
                      const score = muscle
                        ? (statsByMuscle.get(muscle)?.score ?? 0)
                        : null;
                      return (
                        <Path
                          key={pebble.id}
                          d={pebble.d}
                          fill={
                            score == null ? "#4b4b4b" : muscleLoadColor(score)
                          }
                          stroke="#0f0f0f"
                          strokeWidth={2.15}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    },
                  )}
                  {MUSCLE_PEBBLES.filter(
                    (pebble) =>
                      pebble.view === view && pebble.muscle === selectedMuscle,
                  ).map((pebble) => (
                    <Path
                      key={`${pebble.id}-selection`}
                      d={pebble.d}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </G>
              );
            })}
          </Svg>
        </Pressable>
      </View>

      <View
        accessible
        accessibilityLabel="Muscle load legend. Blue is 0 percent. Red is 100 percent."
        style={styles.legend}
      >
        <Text style={styles.legendLabel}>0%</Text>
        <View style={styles.legendSteps}>
          {LOAD_LEGEND_STEPS.map((step) => (
            <View
              key={step}
              style={[
                styles.legendStep,
                { backgroundColor: muscleLoadColor(step) },
              ]}
            />
          ))}
        </View>
        <Text style={styles.legendLabel}>100%</Text>
      </View>

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

      <Dropdown
        options={MUSCLE_OPTIONS}
        value={muscleLabel(selectedMuscle)}
        onSelect={(label) => {
          const muscle = MUSCLES.find(
            (candidate) => muscleLabel(candidate) === label,
          );
          if (muscle) setSelectedMuscle(muscle);
        }}
        placeholder="Select a muscle"
        accessibilityLabel="Select a muscle on the recent load map"
      />

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
  viewLabels: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 24,
  },
  viewLabel: {
    width: "50%",
    color: "#888",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textAlign: "center",
    textTransform: "uppercase",
  },
  mapFrame: { alignItems: "center", overflow: "hidden" },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legendSteps: { flexDirection: "row", gap: 4 },
  legendStep: { width: 20, height: 8, borderRadius: 999 },
  legendLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
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
