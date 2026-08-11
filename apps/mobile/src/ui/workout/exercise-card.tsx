import { DragHandle } from '@/ui/primitives/drag-handle';
import { Dropdown } from '@/ui/primitives/dropdown';
import { ExercisePicker, ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import { SetField, SetFields } from '@/ui/workout/set-fields';
import { DraftExerciseRow, ExerciseRef, ExerciseSearchOption, ExerciseType, RecentExercise } from '@/types/workout';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const EXERCISE_TYPES = ['Sets of Reps', 'Sets of Duration'] as const;

type ExerciseCardProps = {
  exercise: DraftExerciseRow;
  index: number;
  catalogOptions: ExerciseSearchOption[];
  recentExercises?: RecentExercise[];
  onCreateNew?: (name: string) => Promise<ExerciseRef>;
  onSelectExercise: (index: number, selection: ExercisePickerSelection) => void;
  onChangeType: (index: number, field: 'exerciseType', value: ExerciseType) => void;
  onToggleBodyweight: (index: number) => void;
  onRemoveExercise: (index: number) => void;
  onUpdateSet: (index: number, setIdx: number, field: SetField, value: string) => void;
  onIncrementSet: (index: number, setIdx: number) => void;
  onDecrementSet: (index: number, setIdx: number) => void;
  onAddSet: (index: number) => void;
  onRemoveSet: (index: number, setIdx: number) => void;
  onToggleSetComplete?: (index: number, setIdx: number) => void;
  // active-workout only: per-set completion checkbox + completed styling
  showCompletion?: boolean;
  // whether the trash button shows (screen passes exercises.length > 1)
  canRemove: boolean;
};

// One editable exercise card — the shared renderItem body for both the plan/log editor
// (app/modal.tsx) and the live active-workout screen (app/active-workout.tsx). Must be
// rendered inside a react-native-reorderable-list renderItem so DragHandle's
// useReorderableDrag() context is present.
export function ExerciseCard({
  exercise: ex,
  index: i,
  catalogOptions,
  recentExercises = [],
  onCreateNew,
  onSelectExercise,
  onChangeType,
  onToggleBodyweight,
  onRemoveExercise,
  onUpdateSet,
  onIncrementSet,
  onDecrementSet,
  onAddSet,
  onRemoveSet,
  onToggleSetComplete,
  showCompletion = false,
  canRemove,
}: ExerciseCardProps) {
  const allSetsComplete = showCompletion && ex.sets.length > 0 && ex.sets.every((s) => s.completed);
  const showFooter = ex.exerciseType === 'Sets of Reps' || canRemove;

  return (
    <View style={[styles.exerciseCard, allSetsComplete && styles.exerciseCardComplete]}>
      <View style={styles.exerciseNameRow}>
        <ExercisePicker
          options={catalogOptions}
          value={ex.label || null}
          recentExercises={recentExercises}
          onSelect={(selection) => onSelectExercise(i, selection)}
          onCreateNew={onCreateNew}
          placeholder="Select exercise"
          style={styles.exerciseNameDropdownFlex}
        />
        <DragHandle />
      </View>

      <Dropdown
        options={EXERCISE_TYPES}
        value={ex.exerciseType}
        onSelect={(v) => onChangeType(i, 'exerciseType', v as ExerciseType)}
        placeholder="Type of exercise"
        style={styles.exerciseTypeDropdown}
      />

      {ex.sets.map((set, si) => (
        <View key={si} style={[styles.setRow, showCompletion && set.completed && !allSetsComplete && styles.setRowComplete]}>
          {showCompletion && (
            <View style={styles.setCheckboxWrap}>
              <Text style={styles.deleteSetSpacer}> </Text>
              <View style={styles.setCheckboxIconWrap}>
                <TouchableOpacity
                  onPress={() => onToggleSetComplete?.(i, si)}
                  hitSlop={8}
                  style={[styles.setCheckbox, set.completed && styles.setCheckboxChecked]}>
                  {set.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.row}>
            <SetFields
              set={set}
              exerciseType={ex.exerciseType}
              bodyweight={ex.bodyweight}
              onUpdate={(field, v) => onUpdateSet(i, si, field, v)}
              onIncrement={() => onIncrementSet(i, si)}
              onDecrement={() => onDecrementSet(i, si)}
            />
            {ex.sets.length > 1 && (
              <View style={styles.deleteSetButton}>
                <Text style={styles.deleteSetSpacer}> </Text>
                <TouchableOpacity style={styles.deleteSetIconWrap} onPress={() => onRemoveSet(i, si)} hitSlop={12}>
                  <Ionicons name="close-circle" size={26} color="#888" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addSetButton} onPress={() => onAddSet(i)}>
        <Ionicons name="add-circle-outline" size={20} color="#e54242" />
        <Text style={styles.addSetText}>Add Set</Text>
      </TouchableOpacity>

      {showFooter && (
        <View style={styles.exerciseFooter}>
          {ex.exerciseType === 'Sets of Reps' ? (
            <TouchableOpacity style={styles.bodyweightRow} onPress={() => onToggleBodyweight(i)} activeOpacity={0.7}>
              <View style={[styles.checkbox, ex.bodyweight && styles.checkboxChecked]}>
                {ex.bodyweight && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.bodyweightLabel}>Bodyweight exercise</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.exerciseFooterSpacer} />
          )}

          {canRemove && (
            <TouchableOpacity style={styles.removeExerciseButton} onPress={() => onRemoveExercise(i)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  exerciseCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 10,
  },
  exerciseCardComplete: {
    borderColor: 'rgba(229, 66, 66, 0.35)',
    backgroundColor: 'rgba(229, 66, 66, 0.08)',
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  exerciseNameDropdownFlex: {
    flex: 1,
  },
  exerciseTypeDropdown: {
    marginBottom: 12,
  },
  setRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    borderRadius: 10,
    padding: 4,
  },
  setRowComplete: {
    marginHorizontal: -6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 66, 66, 0.08)',
  },
  setCheckboxWrap: {
    alignItems: 'center',
  },
  setCheckboxIconWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setCheckboxChecked: {
    backgroundColor: '#e54242',
    borderColor: '#e54242',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  deleteSetButton: {
    alignItems: 'center',
  },
  deleteSetSpacer: {
    fontSize: 11,
    marginBottom: 4,
    color: 'transparent',
  },
  deleteSetIconWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    borderStyle: 'dashed',
    marginBottom: 10,
    gap: 8,
  },
  addSetText: {
    color: '#e54242',
    fontWeight: '600',
    fontSize: 15,
  },
  exerciseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  exerciseFooterSpacer: {
    flex: 1,
  },
  bodyweightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#e54242',
    borderColor: '#e54242',
  },
  bodyweightLabel: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
  },
  removeExerciseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#241414',
    borderWidth: 1,
    borderColor: '#3a1f1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
