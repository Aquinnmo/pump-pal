import { Workout } from '@/types/workout';
import {
  exerciseLabel,
  summarizePerformedExercise,
  summarizePerformedExerciseSetGroups,
  toDateObj,
  workoutTotalReps,
  workoutVolume,
} from '@/utils/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type { Workout };

interface WorkoutCardProps {
  workout: Workout;
  onDelete?: (id: string) => void;
  onEdit?: (workout: Workout) => void;
}

export function WorkoutCard({ workout, onDelete, onEdit }: WorkoutCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const insets = useSafeAreaInsets();
  const date = toDateObj(workout.date);
  const performedExercises = useMemo(() => workout.performedExercises ?? [], [workout.performedExercises]);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const DISMISS_THRESHOLD = 120;

  const translateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const dismiss = useCallback(() => {
    setShowDetail(false);
  }, []);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        overlayOpacity.value = Math.max(0, 1 - e.translationY / (SCREEN_HEIGHT * 0.4));
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        overlayOpacity.value = withSpring(1);
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${0.7 * overlayOpacity.value})`,
  }));

  const handleOpen = useCallback(() => {
    translateY.value = 0;
    overlayOpacity.value = 1;
    setShowDetail(true);
  }, [translateY, overlayOpacity]);

  const handleShare = useCallback(() => {
    const totalVolume = workoutVolume(workout);
    const totalReps = workoutTotalReps(workout);
    const exerciseCount = performedExercises.length;
    const fmtVolume = totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : `${totalVolume}`;

    const exerciseLines = performedExercises.map((pe) => {
      return `  • ${exerciseLabel(pe)} — ${summarizePerformedExercise(pe)}`;
    }).join('\n');

    const metricParts: string[] = [];
    if (totalVolume > 0) metricParts.push(`Volume: ${fmtVolume} lbs`);
    if (totalReps > 0) metricParts.push(`Total Reps: ${totalReps}`);
    metricParts.push(`Exercises: ${exerciseCount}`);

    const message = [
      `${workout.name} — ${dateStr}`,
      '',
      'Exercises:',
      exerciseLines,
      '',
      metricParts.join('\n'),
      workout.notes ? `\nNotes: ${workout.notes}` : '',
      '',
      'Logged with Pump Pal 💪',
      'https://pump.adam-montgomery.ca',
    ].filter((l) => l !== undefined).join('\n');

    Share.share({ message });
  }, [workout, dateStr, performedExercises]);

  return (
    <>
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={dismiss}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Animated.View style={[styles.modalOverlay, overlayAnimatedStyle]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
            <Animated.View style={[styles.modalCard, cardAnimatedStyle, { paddingBottom: Math.max(40, insets.bottom) }]}>
              {/* Extends sheet background colour behind the Android nav bar */}
              <View style={[styles.navBarFill, { height: insets.bottom }]} />
              <GestureDetector gesture={panGesture}>
                <Animated.View>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderLeft}>
                      <Text style={styles.modalName}>{workout.name}</Text>
                      <Text style={styles.modalDate}>{dateStr}</Text>
                    </View>
                    <TouchableOpacity onPress={dismiss} hitSlop={10} style={styles.modalClose}>
                      <Ionicons name="close" size={22} color="#888" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalDivider} />
                </Animated.View>
              </GestureDetector>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
                {performedExercises.length > 0 ? (
                  performedExercises.map((pe, i) => (
                    <View key={i} style={styles.modalExercise}>
                      <Text style={styles.modalExerciseName}>{exerciseLabel(pe)}</Text>
                      <View style={styles.modalExerciseDetails}>
                        {summarizePerformedExerciseSetGroups(pe).map((setSummary, setIndex) => (
                          <Text key={setIndex} style={styles.modalExerciseDetail}>
                            {setSummary}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.modalEmpty}>No exercises logged.</Text>
                )}

                {workout.notes ? (
                  <View style={styles.modalNotesBox}>
                    <Text style={styles.modalNotesLabel}>Notes</Text>
                    <Text style={styles.modalNotesText}>{workout.notes}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.name}>{workout.name}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <View style={styles.headerRight}>
            
            {onEdit && (
              <TouchableOpacity onPress={() => onEdit(workout)} hitSlop={8} style={styles.editButton}>
                <Text style={styles.editText}>Edit</Text>
                <Ionicons name="pencil-outline" size={20} color="#666" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => onDelete(workout.id)} hitSlop={8} style={styles.actionButton}>
                <Ionicons name="trash-outline" size={22} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

      {performedExercises.length > 0 && (() => {
        const totalVolume = workoutVolume(workout);
        const totalReps = workoutTotalReps(workout);
        const exerciseCount = performedExercises.length;
        const fmtVolume = totalVolume >= 1000
          ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
          : `${totalVolume}`;

        const chips: { value: string; label: string }[] = [];
        if (totalVolume > 0) chips.push({ value: `${fmtVolume} lbs`, label: 'Volume' });
        if (totalReps > 0) chips.push({ value: `${totalReps}`, label: 'Total Reps' });
        chips.push({ value: `${exerciseCount}`, label: exerciseCount === 1 ? 'Exercise' : 'Exercises' });

        return (
          <View style={styles.insightRow}>
            {chips.map((chip, i) => (
              <View key={i} style={styles.insightChip}>
                <Text style={styles.insightLabel}>{chip.label}</Text>
                <Text style={styles.insightValue}>{chip.value}</Text>
              </View>
            ))}
          </View>
        );
      })()}
      
          <View style={styles.viewRow}>
            <TouchableOpacity onPress={handleOpen} hitSlop={8} style={styles.viewButton}>
              <Text style={styles.viewText}>View</Text>
              <Ionicons name="eye-outline" size={20} color="#e54242" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.shareButton}>
              <Text style={styles.shareText}>Share</Text>
              <Ionicons name="share-social" size={20} color="#666" />
            </TouchableOpacity>
          </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    padding: 6,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
  },
  editText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  date: {
    fontSize: 13,
    color: '#888',
  },
  insightRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  insightChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  insightValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  insightLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginLeft: 0,
    marginTop: 4,
  },
  viewText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
  },
  viewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  shareText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  navBarFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1c',
  },
  // --- detail modal ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalHeaderLeft: {
    flex: 1,
  },
  modalName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  modalDate: {
    fontSize: 13,
    color: '#888',
  },
  modalClose: {
    padding: 4,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginBottom: 16,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalExercise: {
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  modalExerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  modalExerciseDetails: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 4,
    minWidth: 120,
  },
  modalExerciseDetail: {
    fontSize: 13,
    color: '#e54242',
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'right',
  },
  modalEmpty: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginTop: 8,
  },
  modalNotesBox: {
    marginTop: 8,
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#e54242',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  modalNotesText: {
    fontSize: 14,
    color: '#aaa',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
