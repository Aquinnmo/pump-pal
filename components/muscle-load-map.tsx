import { MUSCLE_MAP_SEGMENTS, MUSCLE_MAP_VIEWBOX, NEUTRAL_BODY_SEGMENTS } from '@/constants/muscle-map-paths';
import { MUSCLES, type MuscleId, muscleLabel } from '@/constants/muscles';
import type { CatalogExercise, Workout } from '@/types/workout';
import { loadCatalog } from '@/utils/exercise-catalog';
import { computeMuscleLoad, muscleLoadColor, type MuscleLoadStat } from '@/utils/muscle-load';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Dropdown } from '@/components/ui/dropdown';

interface MuscleLoadMapProps {
  workouts: Workout[];
}

const MUSCLE_OPTIONS = MUSCLES.map(muscleLabel);
const LOAD_LEGEND_STEPS = [0, 2, 4, 6, 8] as const;

function statusFor(score: number): string {
  if (score === 0) return 'Not worked recently';
  if (score < 2) return 'Light recent load';
  if (score < 5) return 'Moderate recent load';
  return 'Heavy recent load';
}

function relativeDate(timestamp: number | null): string {
  if (timestamp == null) return 'Not worked in this window';
  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
  if (elapsedDays === 0) return 'Today';
  if (elapsedDays === 1) return 'Yesterday';
  return `${elapsedDays} days ago`;
}

function selectedAccessibility(stat: MuscleLoadStat): string {
  const exercises = stat.contributors
    .slice(0, 3)
    .map((contributor) => contributor.label)
    .join(', ');
  return `${muscleLabel(stat.muscle)}. ${statusFor(stat.score)}. Score ${stat.score.toFixed(
    2
  )}. Last worked ${relativeDate(stat.lastWorkedAt)}.${exercises ? ` Top exercises: ${exercises}.` : ''}`;
}

export function MuscleLoadMap({ workouts }: MuscleLoadMapProps) {
  const { width } = useWindowDimensions();
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>('chest');

  const fetchCatalog = useCallback(async () => {
    setCatalogError(false);
    setCatalog(null);
    const loaded = await loadCatalog();
    if (loaded.length === 0) {
      setCatalogError(true);
      return;
    }
    setCatalog(loaded);
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const result = useMemo(
    () => (catalog ? computeMuscleLoad(workouts, catalog) : null),
    [catalog, workouts]
  );
  const statsByMuscle = useMemo(
    () => new Map(result?.muscles.map((stat) => [stat.muscle, stat]) ?? []),
    [result]
  );
  const selectedStat = statsByMuscle.get(selectedMuscle) ?? {
    muscle: selectedMuscle,
    score: 0,
    lastWorkedAt: null,
    contributors: [],
  };
  const mapWidth = Math.max(232, Math.min(width - 72, 560));
  const mapHeight = (mapWidth * MUSCLE_MAP_VIEWBOX.height) / MUSCLE_MAP_VIEWBOX.width;
  const coverage = result?.coverage ?? {
    recentExercises: 0,
    recentSets: 0,
    matchedExercises: 0,
    matchedSets: 0,
    unmatchedExercises: 0,
    unmatchedSets: 0,
  };
  const noMappedLoad = result != null && result.muscles.every((stat) => stat.score === 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} selectable>
          Recent muscle load
        </Text>
        <Text style={styles.subtitle} selectable>
          Past 7 days. Newer work counts more and fades with a 2-day half-life.
        </Text>
      </View>

      {catalog == null ? (
        catalogError ? (
          <View style={styles.state}>
            <Ionicons name="cloud-offline-outline" size={28} color="#e54242" />
            <Text style={styles.stateTitle} selectable>
              Muscle map unavailable
            </Text>
            <Text style={styles.stateMessage} selectable>
              The exercise catalog could not be loaded, so Timber cannot safely map your work.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading muscle map"
              onPress={fetchCatalog}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Mapping your recent muscle work"
            style={styles.state}
          >
            <ActivityIndicator color="#e54242" />
            <Text style={styles.stateTitle}>Mapping your recent work</Text>
          </View>
        )
      ) : (
        <>
          <View style={styles.viewLabels}>
            <Text style={styles.viewLabel}>Anterior</Text>
            <Text style={styles.viewLabel}>Posterior</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`Anterior and posterior muscle load map. Blue means unworked and red means a load score of eight or more. Selected muscle: ${selectedAccessibility(
              selectedStat
            )}`}
            style={styles.mapFrame}
          >
            <Svg
              width={mapWidth}
              height={mapHeight}
              viewBox={`0 0 ${MUSCLE_MAP_VIEWBOX.width} ${MUSCLE_MAP_VIEWBOX.height}`}
            >
              {NEUTRAL_BODY_SEGMENTS.map((segment) => (
                <Path
                  key={segment.id}
                  d={segment.d}
                  fill="#444"
                  stroke="#0f0f0f"
                  strokeWidth={1.25}
                />
              ))}
              {MUSCLE_MAP_SEGMENTS.map((segment) => {
                const isSelected = segment.muscle === selectedMuscle;
                const score = statsByMuscle.get(segment.muscle)?.score ?? 0;
                return (
                  <Path
                    key={segment.id}
                    d={segment.d}
                    fill={muscleLoadColor(score)}
                    stroke={isSelected ? '#fff' : '#0f0f0f'}
                    strokeWidth={isSelected ? 2.25 : 1.25}
                    onPress={() => setSelectedMuscle(segment.muscle)}
                  />
                );
              })}
            </Svg>
          </View>

          <View
            accessible
            accessibilityLabel="Muscle load legend. Blue is unworked. Red is a score of eight or more."
            style={styles.legend}
          >
            <Text style={styles.legendLabel}>Unworked</Text>
            <View style={styles.legendSteps}>
              {LOAD_LEGEND_STEPS.map((step) => (
                <View key={step} style={[styles.legendStep, { backgroundColor: muscleLoadColor(step) }]} />
              ))}
            </View>
            <Text style={styles.legendLabel}>8+ load</Text>
          </View>

          {noMappedLoad && (
            <Text style={styles.emptyNote} selectable>
              No mapped load in the past 7 days. The map stays blue until a catalog-matched set with recorded work is logged.
            </Text>
          )}

          {coverage.unmatchedExercises > 0 && (
            <View accessible accessibilityRole="text" style={styles.coverageNote}>
              <Ionicons name="information-circle-outline" size={19} color="#60a5fa" />
              <Text style={styles.coverageText} selectable>
                {coverage.unmatchedExercises} of {coverage.recentExercises} recent exercise
                {coverage.recentExercises === 1 ? '' : 's'} could not be mapped and
                {coverage.unmatchedExercises === 1 ? ' was' : ' were'} excluded.
              </Text>
            </View>
          )}

          <Dropdown
            options={MUSCLE_OPTIONS}
            value={muscleLabel(selectedMuscle)}
            onSelect={(label) => {
              const muscle = MUSCLES.find((candidate) => muscleLabel(candidate) === label);
              if (muscle) setSelectedMuscle(muscle);
            }}
            placeholder="Select a muscle"
            accessibilityLabel="Select a muscle on the recent load map"
          />

          <View accessible accessibilityLabel={selectedAccessibility(selectedStat)} style={styles.details}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsHeading}>
                <Text style={styles.muscleName} selectable>
                  {muscleLabel(selectedMuscle)}
                </Text>
                <Text style={styles.status} selectable>
                  {statusFor(selectedStat.score)}
                </Text>
              </View>
              <View style={styles.scoreBlock}>
                <Text style={styles.score} selectable>
                  {selectedStat.score.toFixed(2)}
                </Text>
                <Text style={styles.scoreLabel}>LOAD</Text>
              </View>
            </View>
            <Text style={styles.lastWorked} selectable>
              Last worked: {relativeDate(selectedStat.lastWorkedAt)}
            </Text>

            {selectedStat.contributors.length > 0 ? (
              <View style={styles.contributors}>
                <Text style={styles.contributorsTitle}>Top contributors</Text>
                {selectedStat.contributors.slice(0, 3).map((contributor) => (
                  <View
                    key={`${contributor.exerciseId}:${contributor.variationId ?? 'parent'}:${contributor.label}`}
                    style={styles.contributorRow}
                  >
                    <Text numberOfLines={1} style={styles.contributorLabel} selectable>
                      {contributor.label}
                    </Text>
                    <Text style={styles.contributorScore} selectable>
                      {contributor.score.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noContributors} selectable>
                No mapped exercises contributed to this muscle in the current window.
              </Text>
            )}
          </View>

          <Text style={styles.methodNote} selectable>
            Each set is normalized to your best recorded load for that exact exercise and variation. Primary muscles count fully; secondary muscles count half.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    gap: 16,
  },
  header: { gap: 4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  subtitle: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  state: { minHeight: 168, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  stateTitle: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  stateMessage: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20, textAlign: 'center' },
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#e54242',
  },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  viewLabels: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24 },
  viewLabel: { width: '50%', color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textAlign: 'center', textTransform: 'uppercase' },
  mapFrame: { alignItems: 'center', overflow: 'hidden' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  legendSteps: { flexDirection: 'row', gap: 4 },
  legendStep: { width: 20, height: 8, borderRadius: 999 },
  legendLabel: { color: '#888', fontSize: 12, fontWeight: '700' },
  emptyNote: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20, textAlign: 'center' },
  coverageNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.24)',
    backgroundColor: 'rgba(96, 165, 250, 0.08)',
    borderRadius: 10,
    padding: 12,
  },
  coverageText: { flex: 1, color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  details: { backgroundColor: '#151515', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, padding: 16, gap: 12 },
  detailsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  detailsHeading: { flex: 1, gap: 4 },
  muscleName: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  status: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  scoreBlock: { alignItems: 'flex-end' },
  score: { color: '#fff', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 29 },
  scoreLabel: { color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  lastWorked: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  contributors: { gap: 8, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 12 },
  contributorsTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  contributorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 24 },
  contributorLabel: { flex: 1, color: '#888', fontSize: 14, fontWeight: '500' },
  contributorScore: { color: '#fff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  noContributors: { color: '#888', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  methodNote: { color: '#888', fontSize: 12, fontWeight: '500', lineHeight: 17 },
});
