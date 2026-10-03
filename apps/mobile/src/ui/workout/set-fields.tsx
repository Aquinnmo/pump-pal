import { DraftSubSet, ExerciseType } from '@/types/workout';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type SetField = 'weight' | 'durationMinutes' | 'durationSeconds';

// Where this row sits in a drop set's stack of touching inputs. Only the first row
// shows labels; touching edges go square and share one border. Omit for a lone set.
export type StackPosition = 'first' | 'middle' | 'last';

type SetFieldsProps = {
  set: DraftSubSet;
  stack?: StackPosition;
  exerciseType: ExerciseType;
  bodyweight: boolean;
  onUpdate: (field: SetField, value: string) => void;
  onIncrement: () => void;
  onDecrement: () => void;
};

// The editable numbers for one set — minutes/seconds for a duration exercise, or a
// reps stepper plus a weight box for a reps exercise. Extracted from ExerciseCard so
// the focus view edits a set with the exact same controls the editor uses; returns a
// fragment so the caller keeps ownership of the surrounding row layout.
export function SetFields({
  set,
  stack,
  exerciseType,
  bodyweight,
  onUpdate,
  onIncrement,
  onDecrement,
}: SetFieldsProps) {
  const showLabels = stack === undefined || stack === 'first';
  const boxStack = stack && STACK[stack];
  if (exerciseType === 'Sets of Duration') {
    return (
      <>
        <View style={styles.numField}>
          {showLabels && <Text style={styles.numLabel}>Minutes</Text>}
          <TextInput
            style={[styles.numInput, boxStack]}
            keyboardType="number-pad"
            value={String(set.durationMinutes)}
            onChangeText={(v) => onUpdate('durationMinutes', v)}
          />
        </View>
        <View style={styles.numField}>
          {showLabels && <Text style={styles.numLabel}>Seconds</Text>}
          <TextInput
            style={[styles.numInput, boxStack]}
            keyboardType="number-pad"
            value={String(set.durationSeconds)}
            onChangeText={(v) => onUpdate('durationSeconds', v)}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.numField}>
        {showLabels && <Text style={styles.numLabel}>Reps</Text>}
        <View style={[styles.incrementerContainerHorizontal, boxStack]}>
          <TouchableOpacity onPress={onDecrement} hitSlop={10}>
            <Ionicons name="remove-circle" size={28} color="#e54242" />
          </TouchableOpacity>
          <Text style={styles.incrementerValue}>{set.reps}</Text>
          <TouchableOpacity onPress={onIncrement} hitSlop={10}>
            <Ionicons name="add-circle" size={28} color="#e54242" />
          </TouchableOpacity>
        </View>
      </View>
      {!bodyweight && (
        <View style={styles.numField}>
          {showLabels && <Text style={styles.numLabel}>Weight (lbs)</Text>}
          <View style={styles.weightInputContainer}>
            <TextInput
              style={[styles.numInput, styles.weightInput, boxStack]}
              keyboardType="decimal-pad"
              value={set.weight}
              onChangeText={(v) => onUpdate('weight', v)}
              onBlur={() => {
                if (set.weight === '' || set.weight === '.') onUpdate('weight', '0');
              }}
            />
          </View>
        </View>
      )}
    </>
  );
}

// Touching edges lose their radius; every box below the first drops its top border so
// neighbours share one line instead of doubling up.
const STACK = StyleSheet.create({
  first: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  middle: { borderRadius: 0, borderTopWidth: 0 },
  last: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 },
});

const styles = StyleSheet.create({
  numField: {
    flex: 1,
  },
  numLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  numInput: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  weightInputContainer: {
    flex: 1,
  },
  weightInput: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 0,
  },
  incrementerContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  incrementerValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    paddingVertical: 4,
    fontVariant: ['tabular-nums'],
  },
});
