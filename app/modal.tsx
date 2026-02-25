import { Exercise } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function AddWorkoutModal() {
  const { user } = useAuth();
  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: '', sets: 3, reps: 10, weight: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const addExercise = () =>
    setExercises((prev) => [...prev, { name: '', sets: 3, reps: 10, weight: 0 }]);

  const removeExercise = (i: number) =>
    setExercises((prev) => prev.filter((_, idx) => idx !== i));

  const updateExercise = (i: number, field: keyof Exercise, value: string) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i
          ? { ...ex, [field]: field === 'name' ? value : Number(value) || 0 }
          : ex
      )
    );

  const handleSave = async () => {
    if (!workoutName.trim()) {
      Alert.alert('Error', 'Please enter a workout name.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        name: workoutName.trim(),
        date: Timestamp.now(),
        exercises: exercises.filter((ex) => ex.name.trim() !== ''),
        notes: notes.trim(),
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', 'Could not save workout. ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Workout</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#e54242" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TextInput
          style={styles.input}
          placeholder="Workout name (e.g. Push Day)"
          placeholderTextColor="#555"
          value={workoutName}
          onChangeText={setWorkoutName}
        />

        <Text style={styles.sectionLabel}>Exercises</Text>

        {exercises.map((ex, i) => (
          <View key={i} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseIndex}>Exercise {i + 1}</Text>
              {exercises.length > 1 && (
                <TouchableOpacity onPress={() => removeExercise(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color="#666" />
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Exercise name"
              placeholderTextColor="#555"
              value={ex.name}
              onChangeText={(v) => updateExercise(i, 'name', v)}
            />
            <View style={styles.row}>
              <View style={styles.numField}>
                <Text style={styles.numLabel}>Sets</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="numeric"
                  value={String(ex.sets)}
                  onChangeText={(v) => updateExercise(i, 'sets', v)}
                />
              </View>
              <View style={styles.numField}>
                <Text style={styles.numLabel}>Reps</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="numeric"
                  value={String(ex.reps)}
                  onChangeText={(v) => updateExercise(i, 'reps', v)}
                />
              </View>
              <View style={styles.numField}>
                <Text style={styles.numLabel}>Weight (lbs)</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="numeric"
                  value={String(ex.weight)}
                  onChangeText={(v) => updateExercise(i, 'weight', v)}
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addExButton} onPress={addExercise}>
          <Ionicons name="add-circle-outline" size={18} color="#e54242" />
          <Text style={styles.addExText}>Add Exercise</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Notes (optional)"
          placeholderTextColor="#555"
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e54242',
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  input: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  exerciseCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 10,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  exerciseIndex: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
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
  addExButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 6,
  },
  addExText: {
    color: '#e54242',
    fontWeight: '600',
    fontSize: 14,
  },
});
