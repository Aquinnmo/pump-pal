import { DragHandle } from '@/ui/primitives/drag-handle';
import { Dropdown } from '@/ui/primitives/dropdown';
import { ExercisePicker, ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import { SetField, SetFields, StackPosition } from '@/ui/workout/set-fields';
import { SET_TYPES, setTypeOf } from '@/constants/set-types';
import { setLabels, setParts } from '@/lib/workout-conversion';
import { DraftExerciseRow, ExerciseRef, ExerciseSearchOption, ExerciseType, RecentExercise } from '@/types/workout';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ReactNode, useRef } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const EXERCISE_TYPES = ['Sets of Reps', 'Sets of Duration'] as const;
// Set options menu rows that aren't set types; matched by label in onMenuSelect.
const SET_COMPLETE = 'Complete set';
const SET_INCOMPLETE = 'Mark set incomplete';
const SET_REMOVE = 'Remove set';

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
  // The single entry point for set types: a set's options menu lists the SET_TYPES rows.
  onChangeSetType?: (index: number, setIdx: number, type: string) => void;
  onAddSubSet?: (index: number, setIdx: number) => void;
  onRemoveSubSet?: (index: number, setIdx: number, stage: number) => void;
  // active-workout only: completion actions in the set menu + completed row styling
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
          const allPartsComplete = parts.every((p) => p.completed);
          const menuOptions = [
            ...(showCompletion ? [allPartsComplete ? SET_INCOMPLETE : SET_COMPLETE] : []),
            ...(onChangeSetType ? SET_TYPES.map((t) => t.label) : []),
            ...(ex.sets.length > 1 ? [SET_REMOVE] : []),
          ];
          const onMenuSelect = (option: string) => {
            if (option === SET_REMOVE) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              return onRemoveSet(i, si);
            }
            if (option === SET_COMPLETE || option === SET_INCOMPLETE) {
              if (!allPartsComplete) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // A drop set completes (or reopens) all its parts together.
              parts.forEach((part, stage) => {
                if (!!part.completed !== !allPartsComplete) onToggleSetComplete?.(i, si, stage);
              });
              return;
            }
            onChangeSetType?.(i, si, SET_TYPES.find((t) => t.label === option)!.id);
          };
          // One row per part. Only the first carries the set number, the options menu and
          // the field labels; a drop set's drops stack under it with their inputs touching
          // top to bottom.
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
            const spacer = stage === 0 && <Text style={styles.setLabelSpacer}> </Text>;
            const removable = stage > 0 || ex.sets.length > 1;
            const completeRow = () => {
              if (!part.completed) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleSetComplete?.(i, si, stage);
            };
            const removeRow = () => (stage === 0 ? onRemoveSet(i, si) : onRemoveSubSet?.(i, si, stage));
            const rowComplete = showCompletion && part.completed && !allSetsComplete;
            return (
              <SwipeRow
                key={stage}
                completed={!!part.completed}
                onComplete={showCompletion ? completeRow : undefined}
                onRemove={removable ? removeRow : undefined}
                style={rowComplete && styles.swipeRowComplete}
                containerStyle={[styles.swipeRow, def.subSet && styles.swipeRowStacked, rowComplete && styles.swipeRowCompleteRadius]}>
                <View
                  style={[
                    styles.setRow,
                    def.subSet && styles.setRowStacked,
                    rowComplete && styles.setRowComplete,
                    showCompletion && allSetsComplete && styles.setRowCardComplete,
                  ]}>
                  <View style={styles.setNumberColumn}>
                    {spacer}
                    <View style={styles.setSideCell}>
                      {stage === 0 && <Text style={styles.setNumber}>{labels[si]}</Text>}
                    </View>
                  </View>

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
                    <View style={styles.setMenuColumn}>
                      {spacer}
                      <View style={styles.setSideCell}>
                        {stage === 0 && menuOptions.length > 0 && (
                          <Dropdown
                            options={menuOptions}
                            value={def.label}
                            onSelect={onMenuSelect}
                            placeholder={`Set ${labels[si]}`}
                            renderTrigger={(open) => (
                              <TouchableOpacity
                                onPress={open}
                                hitSlop={12}
                                accessibilityRole="button"
                                accessibilityLabel={`Set ${labels[si]} options`}>
                                <Ionicons name="ellipsis-vertical" size={22} color="#888" />
                              </TouchableOpacity>
                            )}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              </SwipeRow>
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
                  <View style={styles.setNumberColumn} />
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
                    <View style={styles.setMenuColumn} />
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

// The library default is a heavily overdamped spring whose long tail delays
// onSwipeableOpen; this one reaches the edge fast and clamps there.
const SWIPE_SPRING = { mass: 1, damping: 20, stiffness: 300 };
// How far a row must be dragged left before release commits the delete.
const REMOVE_THRESHOLD = 80;
const COLLAPSE_MS = 180;

type SwipeRowProps = {
  completed: boolean;
  // Omitted when the action isn't offered; that side then doesn't swipe.
  onComplete?: () => void;
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// One set (or drop) row: swipe right completes, swipe left deletes. Complete fires on
// release and the row springs straight back. Delete slides the row fully off so the
// panel fills the bar, then collapses its height before the row leaves state, so the
// rows below glide up instead of jumping.
function SwipeRow({ completed, onComplete, onRemove, style, containerStyle, children }: SwipeRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  // The content's natural height, measured on an inner view the wrapper never constrains.
  const rowHeight = useSharedValue(0);
  // 1 = full height; animates to 0 on delete.
  const collapse = useSharedValue(1);
  const removing = useRef(false);
  // Always an explicit height once measured. Reanimated leaves a style key on the native
  // view after the animated style stops returning it, so a "{} when idle" style would
  // strand the next row that reuses this instance at height 0.
  const heightStyle = useAnimatedStyle(() =>
    rowHeight.value === 0 ? {} : { height: rowHeight.value * collapse.value }
  );

  // Rows are keyed by position, so the row that slides into this slot reuses this
  // instance: put it back to rest in the same pass as the removal.
  const finishRemove = () => {
    onRemove?.();
    swipeRef.current?.reset();
    collapse.value = 1;
    removing.current = false;
  };

  return (
    <Animated.View style={[style, styles.swipeClip, heightStyle]}>
      <View onLayout={(e) => (rowHeight.value = e.nativeEvent.layout.height)}>
        <ReanimatedSwipeable
          ref={swipeRef}
          enabled={!!(onComplete || onRemove)}
          animationOptions={SWIPE_SPRING}
          rightThreshold={REMOVE_THRESHOLD}
          containerStyle={containerStyle}
          renderLeftActions={
            onComplete
              ? () => (
                  <View style={[styles.swipeAction, styles.swipeActionComplete]}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.swipeActionText}>{completed ? 'Undo' : 'Complete'}</Text>
                  </View>
                )
              : undefined
          }
          renderRightActions={
            onRemove
              ? () => (
                  <View style={styles.swipeActionDelete}>
                    <View style={styles.swipeActionLabel}>
                      <Ionicons name="trash-outline" size={20} color="#fff" />
                      <Text style={styles.swipeActionText}>Delete</Text>
                    </View>
                  </View>
                )
              : undefined
          }
          // The direction is the swipe's, not the panel's: RIGHT means the row moved right
          // and revealed the left (complete) panel. WillOpen fires on release.
          onSwipeableWillOpen={(direction) => {
            if (direction === SwipeDirection.RIGHT) {
              onComplete?.();
              swipeRef.current?.close();
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }}
          onSwipeableOpen={(direction) => {
            if (direction !== SwipeDirection.LEFT || removing.current) return;
            removing.current = true;
            collapse.value = withTiming(0, { duration: COLLAPSE_MS }, (finished) => {
              if (finished) runOnJS(finishRemove)();
            });
          }}>
          {children}
        </ReanimatedSwipeable>
      </View>
    </Animated.View>
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
  // Opaque, so the swipe action panels behind a sliding row never show through.
  setRow: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    padding: 4,
    backgroundColor: '#141414',
  },
  swipeRow: {
    marginBottom: 10,
    borderRadius: 10,
  },
  // A drop set: its rows sit flush so the inputs stack into one column per field.
  dropStack: {
    marginBottom: 10,
  },
  setRowStacked: {
    paddingVertical: 0,
  },
  swipeRowStacked: {
    marginBottom: 0,
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
  addSubSetText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  // The accent at 8% composited over the card (#141414), then over a completed card, as
  // opaque fills.
  setRowComplete: {
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#251818',
  },
  setRowCardComplete: {
    backgroundColor: '#201313',
  },
  swipeClip: {
    overflow: 'hidden',
  },
  // On the outer wrapper, so the overhang isn't clipped by the swipeable's overflow.
  swipeRowComplete: {
    marginHorizontal: -6,
  },
  swipeRowCompleteRadius: {
    borderRadius: 14,
  },
  swipeAction: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // Destructive is not red here (design-language): the accent marks the affirmative.
  swipeActionComplete: {
    backgroundColor: '#e54242',
  },
  // Spans the whole row, so a committed delete fills the bar; the label sits at the
  // trailing edge where the drag reveals it.
  swipeActionDelete: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 32,
    backgroundColor: '#2a2a2a',
  },
  swipeActionLabel: {
    alignItems: 'center',
    gap: 2,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  setNumberColumn: {
    width: 20,
    alignItems: 'center',
  },
  setMenuColumn: {
    width: 22,
    alignItems: 'center',
  },
  setSideCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumber: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  setLabelSpacer: {
    fontSize: 11,
    marginBottom: 4,
    color: 'transparent',
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
