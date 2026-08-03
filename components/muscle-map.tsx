import { Dropdown } from '@/components/ui/dropdown';
import {
  BODY_SILHOUETTES,
  MUSCLE_MAP_VIEWBOX,
  MUSCLE_PEBBLES,
  muscleAtPoint,
} from '@/constants/muscle-map-paths';
import { muscleLabel, MUSCLES, type MuscleId } from '@/constants/muscles';
import { MUSCLE_MAP_NO_DATA_COLOR, type MuscleMapScores } from '@/utils/muscle-map-scale';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

const MUSCLE_OPTIONS = MUSCLES.map(muscleLabel);

interface MuscleMapProps {
  scores: MuscleMapScores;
  selectedMuscle: MuscleId;
  onSelectMuscle: (muscle: MuscleId) => void;
  colorForScore: (score: number) => string;
  accessibilityLabel: string;
  dropdownAccessibilityLabel: string;
}

/** Shared interactive anterior/posterior muscle-map presentation. */
export function MuscleMap({
  scores,
  selectedMuscle,
  onSelectMuscle,
  colorForScore,
  accessibilityLabel,
  dropdownAccessibilityLabel,
}: MuscleMapProps) {
  const { width } = useWindowDimensions();
  const mapWidth = Math.max(232, Math.min(width - 72, 560));
  const mapHeight = (mapWidth * MUSCLE_MAP_VIEWBOX.height) / MUSCLE_MAP_VIEWBOX.width;

  return (
    <>
      <View style={styles.viewLabels}>
        <Text style={styles.viewLabel}>Anterior</Text>
        <Text style={styles.viewLabel}>Posterior</Text>
      </View>
      <View style={styles.mapFrame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${accessibilityLabel} Tap a muscle to select it.`}
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;
            const muscle = muscleAtPoint(
              (locationX / mapWidth) * MUSCLE_MAP_VIEWBOX.width,
              (locationY / mapHeight) * MUSCLE_MAP_VIEWBOX.height,
            );
            if (muscle) onSelectMuscle(muscle);
          }}
          style={{ width: mapWidth, height: mapHeight }}
        >
          <Svg
            width={mapWidth}
            height={mapHeight}
            pointerEvents="none"
            viewBox={`0 0 ${MUSCLE_MAP_VIEWBOX.width} ${MUSCLE_MAP_VIEWBOX.height}`}
          >
            {BODY_SILHOUETTES.map((silhouette) => (
              <G key={silhouette.view}>
                {silhouette.d.split(/(?=M)/).map((part, index) => (
                  <Path key={`${silhouette.view}-part-${index}`} d={part} fill="#2b2b2b" />
                ))}
                {MUSCLE_PEBBLES.filter((pebble) => pebble.view === silhouette.view).map((pebble) => {
                  const score = pebble.muscle ? scores.get(pebble.muscle) : null;
                  return (
                    <Path
                      key={pebble.id}
                      d={pebble.d}
                      fill={score == null ? MUSCLE_MAP_NO_DATA_COLOR : colorForScore(score)}
                      stroke="#0f0f0f"
                      strokeWidth={2.15}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
                {MUSCLE_PEBBLES.filter(
                  (pebble) => pebble.view === silhouette.view && pebble.muscle === selectedMuscle,
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
            ))}
          </Svg>
        </Pressable>
      </View>
      <Dropdown
        options={MUSCLE_OPTIONS}
        value={muscleLabel(selectedMuscle)}
        onSelect={(label) => {
          const muscle = MUSCLES.find((candidate) => muscleLabel(candidate) === label);
          if (muscle) onSelectMuscle(muscle);
        }}
        placeholder="Select a muscle"
        accessibilityLabel={dropdownAccessibilityLabel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  viewLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  viewLabel: {
    width: '50%',
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  mapFrame: { alignItems: 'center', overflow: 'hidden' },
});
