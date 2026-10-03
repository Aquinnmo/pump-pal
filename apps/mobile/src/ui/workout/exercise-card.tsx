import { DragHandle } from '@/ui/primitives/drag-handle';
import { Dropdown } from '@/ui/primitives/dropdown';
import { ExercisePicker, ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import { SetField, SetFields, StackPosition } from '@/ui/workout/set-fields';
import { SET_TYPES, setTypeOf } from '@/constants/set-types';
import { setLabels, setParts } from '@/lib/workout-conversion';
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
  // `stage` is the part of a drop set (0 = the set itself); see stageOf.
  onUpdateSet: (index: number, setIdx: number, field: SetField, value: string, stage?: number) => void;
  onIncrementSet: (index: number, setIdx: number, stage?: number) => void;
  onDecrementSet: (index: number, setIdx: number, stage?: number) => void;
  onAddSet: (index: number) => void;
  onRemoveSet: (index: number, setIdx: number) => void;
  onToggleSetComplete?: (index: number, setIdx: number, stage?: number) => void;
  // The single entry point for set types: a set's badge opens a sheet of SET_TYPES rows.
  onChangeSetType?: (index: number, setIdx: number, type: string) => void;
  onAddSubSet?: (index: number, setIdx: number) => void;
  onRemoveSubSet?: (index: number, setIdx: number, stage: number) => void;
  // active-workout only: per-set completion checkbox + completed styling
  showCompletion?: boolean;
  // Superset state is positional (see linkedToNext in src/lib/workout-conversion.ts), so
  // the parent list computes it from the neighbouring rows and passes it down.
  inSuperset?: boolean;
  linkedToNext?: boolean;
  canLinkNext?: boolean;
  onToggleSuperset?: (index: number) => void;
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
  onChangeSetType,
  onAddSubSet,
  onRemoveSubSet,
  showCompletion = false,
  inSuperset = false,
  linkedToNext = false,
  canLinkNext = false,
  onToggleSuperset,
}: ExerciseCardProps) {
  const allParts = ex.sets.flatMap(setParts);
  const allSetsComplete = showCompletion && allParts.length > 0 && allParts.every((s) => s.completed);
  const labels = setLabels(ex.sets);

  return (
    <View>
      <View
        style={[
          styles.exerciseCard,
          allSetsComplete && styles.exerciseCardComplete,
          inSuperset && styles.exerciseCardSuperset,
        ]}>
        {inSuperset && <Text style={styles.supersetEyebrow}>Superset</Text>}
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

        {ex.sets.map((set, si) => {
          const def = setTypeOf(set);
          const parts = setParts(set);
          // One row per part. Only the first carries the badge and the field labels; a
          // drop set's drops stack under it with their inputs touching top to bottom.
          const rows = parts.map((part, stage) => {
            const stack: StackPosition | undefined = !def.subSet
              ? undefined
              : stage === 0
                ? 'first'
                : stage === parts.length - 1
                  ? 'last'
                  : 'middle';
            // Spacers line the side columns up with the inputs under the labels; rows
            // without labels need none.
            const spacer = stage === 0 && <Text style={styles.deleteSetSpacer}> </Text>;
            return (
              <View
                key={stage}
                style={[
                  styles.setRow,
                  def.subSet && styles.setRowStacked,
                  showCompletion && part.completed && !allSetsComplete && styles.setRowComplete,
                ]}>
                {onChangeSetType && (
                  <View style={styles.setCheckboxWrap}>
                    {spacer}
                    <View style={styles.setCheckboxIconWrap}>
                      {stage === 0 ? (
                        <Dropdown
                          options={SET_TYPES.map((t) => t.label)}
                          value={def.label}
                          onSelect={(label) => onChangeSetType(i, si, SET_TYPES.find((t) => t.label === label)!.id)}
                          placeholder="Set type"
                          renderTrigger={(open) => (
                            <TouchableOpacity
                              onPress={open}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Set ${labels[si]}, ${def.label}. Change set type`}
                              style={[styles.setBadge, def.id !== 'normal' && styles.setBadgeTyped]}>
                              <Text style={styles.setBadgeText}>{labels[si]}</Text>
                            </TouchableOpacity>
                          )}
                        />
                      ) : (
                        <View style={styles.setBadgeSpacer} />
                      )}
                    </View>
                  </View>
                )}
                {showCompletion && (
                  <View style={styles.setCheckboxWrap}>
                    {spacer}
                    <View style={styles.setCheckboxIconWrap}>
                      <TouchableOpacity
                        onPress={() => onToggleSetComplete?.(i, si, stage)}
                        hitSlop={8}
                        style={[styles.setCheckbox, part.completed && styles.setCheckboxChecked]}>
                        {part.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.row}>
                  <SetFields
                    set={part}
                    stack={stack}
                    exerciseType={ex.exerciseType}
                    bodyweight={ex.bodyweight}
                    onUpdate={(field, v) => onUpdateSet(i, si, field, v, stage)}
                    onIncrement={() => onIncrementSet(i, si, stage)}
                    onDecrement={() => onDecrementSet(i, si, stage)}
                  />
                  {(stage > 0 || ex.sets.length > 1) && (
                    <View style={styles.deleteSetButton}>
                      {spacer}
                      <TouchableOpacity
                        style={styles.deleteSetIconWrap}
                        onPress={() => (stage === 0 ? onRemoveSet(i, si) : onRemoveSubSet?.(i, si, stage))}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={stage === 0 ? `Remove set ${labels[si]}` : `Remove ${def.subSet?.noun} ${stage + 1}`}>
                        <Ionicons name="close-circle" size={26} color="#888" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          });

          if (!def.subSet) return <View key={si}>{rows}</View>;
          return (
            <View key={si} style={styles.dropStack}>
              {rows}
              {onAddSubSet && (
                // Mirrors a set row's columns so the outline sits exactly under the inputs,
                // hanging off the bottom of the stack like one more (empty) part.
                <View style={[styles.setRow, styles.setRowStacked]}>
                  {onChangeSetType && <View style={styles.setBadgeSpacer} />}
                  {showCompletion && <View style={styles.setCheckboxSpacer} />}
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={styles.addSubSetButton}
                      onPress={() => onAddSubSet(i, si)}
                      activeOpacity={0.8}
                      hitSlop={{ top: 4, bottom: 4 }}
                      accessibilityRole="button">
                      <View style={styles.addSubSetOutline}>
                        <Ionicons name="add" size={16} color="#888" />
                        <Text style={styles.addSubSetText}>Add {def.subSet.noun}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.deleteSetColumnSpacer} />
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.addSetButton} onPress={() => onAddSet(i)}>
          <Ionicons name="add-circle-outline" size={20} color="#e54242" />
          <Text style={styles.addSetText}>Add Set</Text>
        </TouchableOpacity>

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

          <TouchableOpacity style={styles.removeExerciseButton} onPress={() => onRemoveExercise(i)} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
          </TouchableOpacity>
        </View>
      </View>
      {canLinkNext && onToggleSuperset && (
        <TouchableOpacity
          style={styles.supersetLink}
          onPress={() => onToggleSuperset(i)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={linkedToNext ? 'Unlink superset from next exercise' : 'Make a superset with the next exercise'}>
          <Ionicons name={linkedToNext ? 'unlink-outline' : 'link-outline'} size={16} color="#888" />
          <Text style={styles.supersetLinkText}>{linkedToNext ? 'Unlink superset' : 'Make a superset'}</Text>
        </TouchableOpacity>
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
  // Flat accent edge, not a tint: grouping is structure, not status.
  exerciseCardSuperset: {
    borderLeftWidth: 2,
    borderLeftColor: '#e54242',
  },
  supersetEyebrow: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  supersetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: -4,
    marginBottom: 4,
  },
  supersetLinkText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
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
  // A drop set: its rows sit flush so the inputs stack into one column per field.
  dropStack: {
    marginBottom: 10,
  },
  setRowStacked: {
    marginBottom: 0,
    paddingVertical: 0,
  },
  // A U-shaped dashed outline: iOS only draws dashed borders when all four sides match,
  // so this is a full dashed box pushed up past the clip by its radius, which hides
  // the top edge and its rounded corners.
  addSubSetButton: {
    flex: 1,
    overflow: 'hidden',
  },
  addSubSetOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: -8,
    paddingTop: 8 + 8,
    paddingBottom: 8,
    // Same dashed border as Add Set, so the two add actions read as one family.
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2a2a2a',
    borderRadius: 8,
  },
  setCheckboxSpacer: {
    width: 26,
  },
  deleteSetColumnSpacer: {
    width: 26,
  },
  addSubSetText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
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
  setBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setBadgeSpacer: {
    width: 28,
  },
  // A typed set's badge reads brighter, echoing the block around its parts.
  setBadgeTyped: {
    borderColor: '#888',
  },
  setBadgeText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
