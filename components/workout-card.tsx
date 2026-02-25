import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const date = getDate(workout.date);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
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

      {workout.exercises.length > 0 && (
        <View style={styles.exerciseList}>
          {workout.exercises.map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseDetail}>
                {ex.exerciseType === 'Sets of Duration'
                  ? `${ex.sets} × ${ex.durationMinutes ? `${ex.durationMinutes}m ` : ''}${ex.durationSeconds ?? 0}s`
                  : `${ex.sets} × ${ex.reps}${!ex.bodyweight ? ` @ ${ex.weight} lbs` : ''}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {workout.notes ? <Text style={styles.notes}>{workout.notes}</Text> : null}
    </View>
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
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  exerciseList: {
    gap: 6,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  exerciseDetail: {
    fontSize: 13,
    color: '#888',
  },
  notes: {
    marginTop: 10,
    fontSize: 13,
    color: '#777',
    fontStyle: 'italic',
  },
});
