import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AddWorkoutModal() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<{
    name: string;
    sets: number;
    reps: number;
    weight: string;
    bodyweight: boolean;
  }[]>([{ name: '', sets: 3, reps: 10, weight: '', bodyweight: false }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [isToday, setIsToday] = useState(true);
  const [workoutDate, setWorkoutDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    const fetchWorkout = async () => {
      try {
        const docRef = doc(db, 'users', user.uid, 'workouts', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setWorkoutName(data.name || '');
          setNotes(data.notes || '');
          if (data.date) {
            const date = data.date.toDate();
            setWorkoutDate(date);
            const today = new Date();
            if (
              date.getDate() !== today.getDate() ||
              date.getMonth() !== today.getMonth() ||
              date.getFullYear() !== today.getFullYear()
            ) {
              setIsToday(false);
            }
          }
          if (data.exercises && data.exercises.length > 0) {
            setExercises(
              data.exercises.map((ex: any) => ({
                name: ex.name || '',
                sets: ex.sets || 0,
                reps: ex.reps || 0,
                weight: ex.bodyweight ? '' : String(ex.weight || ''),
                bodyweight: ex.bodyweight || false,
              }))
            );
          }
        }
      } catch (err) {
        showAlert('Error', 'Could not load workout details.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkout();
  }, [id, user]);

  const addExercise = () =>
    setExercises((prev) => [...prev, { name: '', sets: 3, reps: 10, weight: '', bodyweight: false }]);

  const toggleBodyweight = (i: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, bodyweight: !ex.bodyweight, weight: '' } : ex
      )
    );

  const removeExercise = (i: number) =>
    setExercises((prev) => prev.filter((_, idx) => idx !== i));

  const updateExercise = (i: number, field: string, value: string) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i
          ? { ...ex, [field]: field === 'name' || field === 'weight' ? value : Number(value) || 0 }
          : ex
      )
    );

  const increment = (i: number, field: 'sets' | 'reps') => {
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, [field]: ex[field] + 1 } : ex
      )
    );
  };

  const decrement = (i: number, field: 'sets' | 'reps') => {
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, [field]: Math.max(0, ex[field] - 1) } : ex
      )
    );
  };

  const handleSave = async () => {
    if (!workoutName.trim()) {
      showAlert('Error', 'Please enter a workout name.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const filteredExercises = exercises
        .filter((ex) => ex.name.trim() !== '')
        .map((ex) => ({
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          bodyweight: ex.bodyweight,
          weight: ex.bodyweight ? 0 : Number(ex.weight) || 0,
        }));

      const finalDate = isToday ? new Date() : workoutDate;

      if (id) {
        await updateDoc(doc(db, 'users', user.uid, 'workouts', id), {
          name: workoutName.trim(),
          date: Timestamp.fromDate(finalDate),
          exercises: filteredExercises,
          notes: notes.trim(),
        });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          name: workoutName.trim(),
          date: Timestamp.fromDate(finalDate),
          exercises: filteredExercises,
          notes: notes.trim(),
        });
      }
      router.back();
    } catch (err: any) {
      showAlert('Error', 'Could not save workout. ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{id ? 'Edit Workout' : 'Log Workout'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || loading}>
          {saving ? (
            <ActivityIndicator color="#e54242" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#e54242" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <TextInput
            style={styles.input}
            placeholder="Workout name (e.g. Push Day)"
            placeholderTextColor="#555"
            value={workoutName}
            onChangeText={setWorkoutName}
          />

          <View style={styles.dateSection}>
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setIsToday(!isToday)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, isToday && styles.checkboxChecked]}>
                {isToday && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>Today's Workout</Text>
            </TouchableOpacity>

            {!isToday && (
              <View style={styles.datePickerContainer}>
                <Text style={styles.dateLabel}>Workout Date:</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: workoutDate.toISOString().split('T')[0],
                    onChange: (e: any) => {
                      if (e.target.value) setWorkoutDate(new Date(e.target.value + 'T12:00:00'));
                    },
                    style: {
                      background: '#2a2a2a',
                      color: '#fff',
                      border: '1px solid #3a3a3a',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: '15px',
                      cursor: 'pointer',
                      colorScheme: 'dark',
                    },
                  })
                ) : Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={workoutDate}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      if (date) setWorkoutDate(date);
                    }}
                    themeVariant="dark"
                  />
                ) : (
                  <>
                    <TouchableOpacity 
                      style={styles.dateButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.dateButtonText}>
                        {workoutDate.toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={workoutDate}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                          setShowDatePicker(false);
                          if (date) setWorkoutDate(date);
                        }}
                      />
                    )}
                  </>
                )}
              </View>
            )}
          </View>

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
                {ex.bodyweight ? (
                  <View style={styles.incrementerContainerHorizontal}>
                    <TouchableOpacity onPress={() => decrement(i, 'sets')} hitSlop={10}>
                      <Ionicons name="remove-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                    <Text style={styles.incrementerValue}>{ex.sets}</Text>
                    <TouchableOpacity onPress={() => increment(i, 'sets')} hitSlop={10}>
                      <Ionicons name="add-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.incrementerContainer}>
                    <TouchableOpacity onPress={() => increment(i, 'sets')} style={styles.incrementerButton} hitSlop={10}>
                      <Ionicons name="add-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                    <Text style={styles.incrementerValue}>{ex.sets}</Text>
                    <TouchableOpacity onPress={() => decrement(i, 'sets')} style={styles.incrementerButton} hitSlop={10}>
                      <Ionicons name="remove-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={styles.numField}>
                <Text style={styles.numLabel}>Reps</Text>
                {ex.bodyweight ? (
                  <View style={styles.incrementerContainerHorizontal}>
                    <TouchableOpacity onPress={() => decrement(i, 'reps')} hitSlop={10}>
                      <Ionicons name="remove-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                    <Text style={styles.incrementerValue}>{ex.reps}</Text>
                    <TouchableOpacity onPress={() => increment(i, 'reps')} hitSlop={10}>
                      <Ionicons name="add-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.incrementerContainer}>
                    <TouchableOpacity onPress={() => increment(i, 'reps')} style={styles.incrementerButton} hitSlop={10}>
                      <Ionicons name="add-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                    <Text style={styles.incrementerValue}>{ex.reps}</Text>
                    <TouchableOpacity onPress={() => decrement(i, 'reps')} style={styles.incrementerButton} hitSlop={10}>
                      <Ionicons name="remove-circle" size={28} color="#e54242" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {!ex.bodyweight && (
                <View style={styles.numField}>
                  <Text style={styles.numLabel}>Weight (lbs)</Text>
                  <View style={styles.weightInputContainer}>
                    <TextInput
                      style={[styles.numInput, styles.weightInput]}
                      keyboardType="decimal-pad"
                      value={ex.weight}
                      onChangeText={(v) => updateExercise(i, 'weight', v)}
                      onBlur={() => {
                        if (ex.weight === '' || ex.weight === '.') {
                          updateExercise(i, 'weight', '0');
                        }
                      }}
                    />
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.bodyweightRow}
              onPress={() => toggleBodyweight(i)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, ex.bodyweight && styles.checkboxChecked]}>
                {ex.bodyweight && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.bodyweightLabel}>Bodyweight exercise</Text>
            </TouchableOpacity>
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

        <TouchableOpacity
          style={[styles.bigSaveButton, (saving || loading) && styles.bigSaveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || loading}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bigSaveButtonText}>{id ? 'Save Changes' : 'Save Workout'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  dateSection: {
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  checkboxLabel: {
    color: '#fff',
    fontSize: 15,
  },
  datePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 12,
  },
  dateLabel: {
    color: '#fff',
    fontSize: 15,
  },
  bodyweightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  bodyweightLabel: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
  },
  dateButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
  },
  dateButtonText: {
    color: '#fff',
    fontSize: 15,
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
  weightInputContainer: {
    flex: 1,
  },
  weightInput: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 0,
  },
  incrementerContainer: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  incrementerButton: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  incrementerValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    paddingVertical: 4,
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
  bigSaveButton: {
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bigSaveButtonDisabled: {
    opacity: 0.5,
  },
  bigSaveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
