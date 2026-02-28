import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const date = getDate(workout.date);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      <Modal visible={showDetail} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Text style={styles.modalName}>{workout.name}</Text>
                <Text style={styles.modalDate}>{dateStr}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDetail(false)} hitSlop={10} style={styles.modalClose}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

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
          </View>
        </View>
      </Modal>

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.name}>{workout.name}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowDetail(true)} hitSlop={8} style={styles.viewButton}>
              <Text style={styles.viewText}>View</Text>
              <Ionicons name="eye-outline" size={16} color="#e54242" />
            </TouchableOpacity>
            {onEdit && (
              <TouchableOpacity onPress={() => onEdit(workout)} hitSlop={8} style={styles.editButton}>
                <Text style={styles.editText}>Edit</Text>
                <Ionicons name="pencil-outline" size={16} color="#666" />
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
    padding: 6,
  },
  viewText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
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
