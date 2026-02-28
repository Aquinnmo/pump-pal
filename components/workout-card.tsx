import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
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

export interface Exercise {
  name: string;
  exerciseType?: 'Sets of Reps' | 'Sets of Duration';
  sets: number;
  reps: number;
  weight: number;
  bodyweight?: boolean;
  durationMinutes?: number;
  durationSeconds?: number;
}

export interface Workout {
  id: string;
  name: string;
  date: { seconds: number; nanoseconds: number } | Date;
  exercises: Exercise[];
  notes?: string;
}

interface WorkoutCardProps {
  workout: Workout;
  onDelete?: (id: string) => void;
  onEdit?: (workout: Workout) => void;
}

function getDate(date: Workout['date']): Date {
  if (date instanceof Date) return date;
  return new Date(date.seconds * 1000);
}

export function WorkoutCard({ workout, onDelete, onEdit }: WorkoutCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const insets = useSafeAreaInsets();
  const date = getDate(workout.date);
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
    const weighted = workout.exercises.filter(
      (ex) => ex.exerciseType !== 'Sets of Duration' && !ex.bodyweight && Number(ex.weight) > 0
    );
    const repsExs = workout.exercises.filter((ex) => ex.exerciseType !== 'Sets of Duration');
    const totalVolume = weighted.reduce((s, ex) => s + ex.sets * ex.reps * Number(ex.weight), 0);
    const totalReps = repsExs.reduce((s, ex) => s + ex.sets * ex.reps, 0);
    const exerciseCount = workout.exercises.length;
    const fmtVolume = totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : `${totalVolume}`;

    const exerciseLines = workout.exercises.map((ex) => {
      const detail = ex.exerciseType === 'Sets of Duration'
        ? `${ex.sets} × ${ex.durationMinutes ? `${ex.durationMinutes}m ` : ''}${ex.durationSeconds ?? 0}s`
        : `${ex.sets} × ${ex.reps} rep${ex.reps !== 1 ? 's' : ''}${!ex.bodyweight ? ` @ ${ex.weight} lbs` : ''}`;
      return `  • ${ex.name} — ${detail}`;
    }).join('\n');

    const metricParts: string[] = [];
    if (weighted.length > 0) metricParts.push(`Volume: ${fmtVolume} lbs`);
    if (repsExs.length > 0) metricParts.push(`Total Reps: ${totalReps}`);
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
  }, [workout, dateStr]);

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
                {workout.exercises.length > 0 ? (
                  workout.exercises.map((ex, i) => (
                    <View key={i} style={styles.modalExercise}>
                      <Text style={styles.modalExerciseName}>{ex.name}</Text>
                      <Text style={styles.modalExerciseDetail}>
                        {ex.exerciseType === 'Sets of Duration'
                          ? `${ex.sets} × ${ex.durationMinutes ? `${ex.durationMinutes}m ` : ''}${ex.durationSeconds ?? 0}s`
                          : `${ex.sets} × ${ex.reps} rep${ex.reps !== 1 ? 's' : ''}${!ex.bodyweight ? ` @ ${ex.weight} lbs` : ''}`}
                      </Text>
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

      {workout.exercises.length > 0 && (() => {
        const weighted = workout.exercises.filter(
          (ex) => ex.exerciseType !== 'Sets of Duration' && !ex.bodyweight && Number(ex.weight) > 0
        );
        const repsExs = workout.exercises.filter(
          (ex) => ex.exerciseType !== 'Sets of Duration'
        );
        const totalVolume = weighted.reduce((s, ex) => s + ex.sets * ex.reps * Number(ex.weight), 0);
        const totalReps = repsExs.reduce((s, ex) => s + ex.sets * ex.reps, 0);
        const exerciseCount = workout.exercises.length;
        const fmtVolume = totalVolume >= 1000
          ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
          : `${totalVolume}`;

        const chips: { value: string; label: string }[] = [];
        if (weighted.length > 0) chips.push({ value: `${fmtVolume} lbs`, label: 'Volume' });
        if (repsExs.length > 0) chips.push({ value: `${totalReps}`, label: 'Total Reps' });
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
    alignItems: 'center',
  },
  modalExerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  modalExerciseDetail: {
    fontSize: 13,
    color: '#e54242',
    fontWeight: '500',
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
