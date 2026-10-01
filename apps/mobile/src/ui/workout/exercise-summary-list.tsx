import { exerciseLabel, groupSupersets, summarizePerformedExerciseSetGroups } from '@/lib/workout-conversion';
import { PerformedExercise } from '@/types/workout';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

// Read-only exercise list shared by the planned queue and the workout detail sheet.
// A superset renders as one box with a hairline between its exercises, so the grouping
// reads as structure rather than as a label to decode.
export function ExerciseSummaryList({
  exercises,
  style,
}: {
  exercises: PerformedExercise[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.list, style]}>
      {groupSupersets(exercises).map((group, g) => (
        <View key={g} style={styles.group}>
          {group.length > 1 && <Text style={styles.supersetEyebrow}>Superset</Text>}
          {group.map((pe, i) => (
            <View key={i} style={[styles.row, i > 0 && styles.rowDivided]}>
              <Text style={styles.name}>{exerciseLabel(pe)}</Text>
              <View style={styles.details}>
                {summarizePerformedExerciseSetGroups(pe).map((setSummary, setIndex) => (
                  <Text key={setIndex} style={styles.summary}>
                    {setSummary}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  group: {
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
  },
  supersetEyebrow: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingTop: 12,
  },
  row: {
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  details: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 4,
    minWidth: 120,
  },
  summary: {
    fontSize: 13,
    color: '#e54242',
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'right',
  },
});
