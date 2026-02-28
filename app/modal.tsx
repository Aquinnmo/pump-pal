import { Dropdown } from '@/components/ui/dropdown';
import { Workout } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { generateSplitWorkoutNames, suggestWorkoutCompletion } from '@/utils/gemini-workout-suggestions';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
  const [isCustomWorkoutName, setIsCustomWorkoutName] = useState(false);
  const [customWorkoutName, setCustomWorkoutName] = useState('');
  const [workoutNameOptions, setWorkoutNameOptions] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const EXERCISE_TYPES = ['Sets of Reps', 'Sets of Duration'] as const;
  type ExerciseType = typeof EXERCISE_TYPES[number];

  const [exercises, setExercises] = useState<{
    name: string;
    isCustomName: boolean;
    customName: string;
    exerciseType: ExerciseType;
    sets: number;
    reps: number;
    durationMinutes: number;
    durationSeconds: number;
    weight: string;
    bodyweight: boolean;
  }[]>([{ name: '', isCustomName: false, customName: '', exerciseType: 'Sets of Reps', sets: 3, reps: 10, durationMinutes: 0, durationSeconds: 30, weight: '', bodyweight: false }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsesLeft, setAiUsesLeft] = useState(3);
  const [splitType, setSplitType] = useState<string>('');
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const [isToday, setIsToday] = useState(true);
  const [workoutDate, setWorkoutDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Fetch user's split + names used in past workouts to build the name dropdown
  // Also loads today's AI suggestion usage count from Firestore (shared across platforms,
  // resets at midnight UTC)
  useEffect(() => {
    if (!user) return;
    const loadNameOptions = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const data = userSnap.data();

        // Load AI usage from Firestore
        const todayUTC = new Date().toISOString().slice(0, 10);
        const aiUsage = data?.aiUsage as { date: string; count: number } | undefined;
        if (aiUsage && aiUsage.date === todayUTC) {
          setAiUsesLeft(3 - (aiUsage.count ?? 0));
        } else {
          setAiUsesLeft(3);
        }

        const splitType = data?.workoutSplit?.type;
        const customSplitDesc: string = data?.workoutSplit?.custom ?? '';
        let splitNames: string[] = isSplitOption(splitType) ? SPLIT_WORKOUT_NAMES[splitType] : [];

        // For "Other" splits, ask Gemini to generate day names (cached per description)
        if (splitType === 'Other' && customSplitDesc) {
          const cacheKey = `pumppal_split_names_v2_${customSplitDesc.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            try { splitNames = JSON.parse(cached); } catch { /* ignore */ }
          } else {
            try {
              const generated = await generateSplitWorkoutNames(customSplitDesc);
              if (generated.length > 0) {
                splitNames = generated;
                await AsyncStorage.setItem(cacheKey, JSON.stringify(generated));
              }
            } catch { /* silently fall through to used names */ }
          }
        }

        // Collect unique names actually used in saved workouts
        const workoutsSnap = await getDocs(
          query(collection(db, 'users', user.uid, 'workouts'), orderBy('date', 'desc'))
        );
        const usedNames = new Set<string>();
        const historyData: Workout[] = [];
        workoutsSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.name) usedNames.add(data.name);
          historyData.push({ id: d.id, ...data } as Workout);
        });
        setWorkoutHistory(historyData);
        setSplitType(splitType ?? '');

        // Merge: split names first, then any used names not already in the split list
        const merged = [...splitNames];
        usedNames.forEach((n) => { if (!merged.includes(n)) merged.push(n); });
        setWorkoutNameOptions(merged);

        // Auto-select next predicted workout type for new workouts only
        if (!id && splitNames.length > 1) {
          // Find the most recent workout whose name is in the split rotation
          const lastSplitWorkout = historyData.find((w) => splitNames.includes(w.name));
          if (lastSplitWorkout) {
            const lastIdx = splitNames.indexOf(lastSplitWorkout.name);
            const nextName = splitNames[(lastIdx + 1) % splitNames.length];
            setWorkoutName(nextName);
          } else if (splitNames.length > 0) {
            // No history yet — default to first in rotation
            setWorkoutName(splitNames[0]);
          }
        }
      } catch {
        // silently fail — user can still type a name
      }
    };
    loadNameOptions();
  }, [user]);

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
                isCustomName: false,
                customName: '',
                exerciseType: ex.exerciseType || 'Sets of Reps',
                sets: ex.sets || 0,
                reps: ex.reps || 0,
                durationMinutes: ex.durationMinutes || 0,
                durationSeconds: ex.durationSeconds || 0,
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

  // When editing a workout, once both the workout name and name options are available,
  // determine whether the loaded name is a known option or a custom one.
  // We use a ref to ensure resolution only happens once per edit session.
  const editNameResolved = React.useRef(false);
  useEffect(() => {
    if (!id || editNameResolved.current || !workoutName || workoutNameOptions.length === 0) return;
    editNameResolved.current = true;
    if (!workoutNameOptions.includes(workoutName)) {
      setIsCustomWorkoutName(true);
      setCustomWorkoutName(workoutName);
      setWorkoutName('Other');
    } else {
      setIsCustomWorkoutName(false);
    }
  }, [id, workoutName, workoutNameOptions]);

  // After workout name + history are known, resolve any exercise names that aren't
  // in the known options list for this workout type — mark them as custom.
  const editExercisesResolved = React.useRef(false);
  useEffect(() => {
    if (!id || editExercisesResolved.current || workoutHistory.length === 0) return;
    const effectiveName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName;
    if (!effectiveName) return;
    editExercisesResolved.current = true;
    const opts = new Set(getExerciseOptions(effectiveName));
    setExercises((prev) =>
      prev.map((ex) => {
        if (!ex.name.trim() || opts.has(ex.name.trim())) return ex;
        return { ...ex, isCustomName: true, customName: ex.name, name: 'Other' };
      })
    );
  }, [id, workoutName, isCustomWorkoutName, customWorkoutName, workoutHistory]);

  const addExercise = () =>
    setExercises((prev) => [...prev, { name: '', isCustomName: false, customName: '', exerciseType: 'Sets of Reps', sets: 3, reps: 10, durationMinutes: 0, durationSeconds: 30, weight: '', bodyweight: false }]);

  const selectExerciseName = (i: number, value: string) => {
    const effectiveWorkoutName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName;
    if (value === 'Other') {
      setExercises((prev) =>
        prev.map((ex, idx) => idx === i ? { ...ex, name: 'Other', isCustomName: true, customName: '' } : ex)
      );
    } else {
      const last = getLastExerciseData(effectiveWorkoutName, value);
      setExercises((prev) =>
        prev.map((ex, idx) => {
          if (idx !== i) return ex;
          return {
            ...ex,
            name: value,
            isCustomName: false,
            customName: '',
            ...(last ? {
              exerciseType: last.exerciseType ?? ex.exerciseType,
              sets: last.sets ?? ex.sets,
              reps: last.reps ?? ex.reps,
              durationMinutes: last.durationMinutes ?? ex.durationMinutes,
              durationSeconds: last.durationSeconds ?? ex.durationSeconds,
              bodyweight: last.bodyweight ?? ex.bodyweight,
              weight: last.bodyweight ? '' : String(last.weight ?? ex.weight),
            } : {}),
          };
        })
      );
    }
  };

  const getExerciseOptions = (forWorkoutName: string): string[] => {
    const seen = new Set<string>();
    workoutHistory.forEach((w) => {
      if (w.name === forWorkoutName) {
        w.exercises.forEach((ex) => { if (ex.name?.trim()) seen.add(ex.name.trim()); });
      }
    });
    return Array.from(seen);
  };

  // workoutHistory is already sorted date desc, so the first match is the most recent.
  const getLastExerciseData = (forWorkoutName: string, exerciseName: string) => {
    for (const w of workoutHistory) {
      if (w.name !== forWorkoutName) continue;
      const match = w.exercises.find((ex) => ex.name?.trim() === exerciseName);
      if (match) return match;
    }
    return null;
  };

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
          ? { ...ex, [field]: ['name', 'weight', 'exerciseType'].includes(field) ? value : Number(value) || 0 }
          : ex
      )
    );

  const increment = (i: number, field: 'sets' | 'reps' | 'durationMinutes' | 'durationSeconds') => {
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        const maxVal = field === 'durationSeconds' ? 59 : Infinity;
        return { ...ex, [field]: Math.min(maxVal, ex[field] + 1) };
      })
    );
  };

  const decrement = (i: number, field: 'sets' | 'reps' | 'durationMinutes' | 'durationSeconds') => {
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, [field]: Math.max(0, ex[field] - 1) } : ex
      )
    );
  };

  const handleAISuggest = async () => {
    if (!user || aiUsesLeft <= 0) return;
    const finalName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName.trim();
    setAiLoading(true);
    try {
      const suggested = await suggestWorkoutCompletion(
        finalName,
        splitType,
        exercises,
        workoutHistory
      );

      // Increment usage count in Firestore (shared across platforms, resets at midnight UTC)
      const todayUTC = new Date().toISOString().slice(0, 10);
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const existing = userSnap.data()?.aiUsage as { date: string; count: number } | undefined;
      const newCount = existing && existing.date === todayUTC ? existing.count + 1 : 1;
      await updateDoc(userRef, { aiUsage: { date: todayUTC, count: newCount } });
      setAiUsesLeft(3 - newCount);

      if (suggested.length === 0) {
        showAlert('AI Suggestions', 'Your workout already looks well balanced!');
        return;
      }
      setExercises((prev) => [...prev, ...suggested]);
    } catch (e) {
      console.error('AI workout suggestion failed:', e);
      showAlert('Error', 'Could not get AI suggestions. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'workouts', id));
      router.back();
    } catch (err: any) {
      showAlert('Error', 'Could not delete workout. ' + err.message);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleSave = async () => {
    const finalName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName.trim();
    if (!finalName) {
      showAlert('Error', 'Please select or enter a workout name.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const filteredExercises = exercises
        .filter((ex) => (ex.isCustomName ? ex.customName.trim() : ex.name.trim()) !== '')
        .map((ex) => {
          const actualName = ex.isCustomName ? ex.customName.trim() : ex.name;
          const base = {
            name: actualName,
            exerciseType: ex.exerciseType,
            sets: ex.sets,
          };
          if (ex.exerciseType === 'Sets of Duration') {
            return { ...base, durationMinutes: ex.durationMinutes, durationSeconds: ex.durationSeconds };
          }
          return {
            ...base,
            reps: ex.reps,
            bodyweight: ex.bodyweight,
            weight: ex.bodyweight ? 0 : Number(ex.weight) || 0,
          };
        });

      const finalDate = isToday ? new Date() : workoutDate;

      if (id) {
        await updateDoc(doc(db, 'users', user.uid, 'workouts', id), {
          name: finalName,
          date: Timestamp.fromDate(finalDate),
          exercises: filteredExercises,
          notes: notes.trim(),
        });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          name: finalName,
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          {workoutNameOptions.length > 0 ? (
            <>
              <Dropdown
                options={[...workoutNameOptions, 'Other']}
                value={isCustomWorkoutName ? 'Other' : (workoutName || null)}
                onSelect={(v) => {
                  if (v === 'Other') {
                    setIsCustomWorkoutName(true);
                    setWorkoutName('Other');
                  } else {
                    setIsCustomWorkoutName(false);
                    setWorkoutName(v);
                    setCustomWorkoutName('');
                  }
                }}
                placeholder="Select workout name"
                style={styles.nameDropdown}
              />
              {isCustomWorkoutName && (
                <TextInput
                  style={styles.input}
                  placeholder="Enter workout name"
                  placeholderTextColor="#555"
                  value={customWorkoutName}
                  onChangeText={setCustomWorkoutName}
                />
              )}
            </>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Workout name (e.g. Push Day)"
              placeholderTextColor="#555"
              value={isCustomWorkoutName ? customWorkoutName : workoutName}
              onChangeText={(v) => {
                setIsCustomWorkoutName(true);
                setCustomWorkoutName(v);
              }}
            />
          )}

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
            {(() => {
              const effectiveWorkoutName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName;
              const exerciseOpts = getExerciseOptions(effectiveWorkoutName);
              return exerciseOpts.length > 0 ? (
                <>
                  <Dropdown
                    options={[...exerciseOpts, 'Other']}
                    value={ex.isCustomName ? 'Other' : (ex.name || null)}
                    onSelect={(v) => selectExerciseName(i, v)}
                    placeholder="Select exercise"
                    style={styles.exerciseNameDropdown}
                  />
                  {ex.isCustomName && (
                    <TextInput
                      style={styles.input}
                      placeholder="Exercise name"
                      placeholderTextColor="#555"
                      value={ex.customName}
                      onChangeText={(v) =>
                        setExercises((prev) =>
                          prev.map((e, idx) => idx === i ? { ...e, customName: v } : e)
                        )
                      }
                    />
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Exercise name"
                  placeholderTextColor="#555"
                  value={ex.isCustomName ? ex.customName : ex.name}
                  onChangeText={(v) =>
                    setExercises((prev) =>
                      prev.map((e, idx) => idx === i ? { ...e, name: v, isCustomName: false, customName: '' } : e)
                    )
                  }
                />
              );
            })()}

            <Text style={styles.exerciseTypeLabel}>Type of Exercise</Text>
            <Dropdown
              options={EXERCISE_TYPES}
              value={ex.exerciseType}
              onSelect={(v) => updateExercise(i, 'exerciseType', v)}
              placeholder="Type of exercise"
              style={styles.exerciseTypeDropdown}
            />

            <View style={styles.row}>
              {/* Sets — shared by both types */}
              <View style={styles.numField}>
                <Text style={styles.numLabel}>Sets</Text>
                {ex.exerciseType === 'Sets of Duration' || ex.bodyweight ? (
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

              {ex.exerciseType === 'Sets of Duration' ? (
                <>
                  {/* Minutes */}
                  <View style={styles.numField}>
                    <Text style={styles.numLabel}>Minutes</Text>
                    <TextInput
                      style={styles.numInput}
                      keyboardType="number-pad"
                      value={String(ex.durationMinutes)}
                      onChangeText={(v) => updateExercise(i, 'durationMinutes', v)}
                      onBlur={() => {
                        if (ex.durationMinutes === 0 || isNaN(ex.durationMinutes)) {
                          updateExercise(i, 'durationMinutes', '0');
                        }
                      }}
                    />
                  </View>
                  {/* Seconds */}
                  <View style={styles.numField}>
                    <Text style={styles.numLabel}>Seconds</Text>
                    <TextInput
                      style={styles.numInput}
                      keyboardType="number-pad"
                      value={String(ex.durationSeconds)}
                      onChangeText={(v) => {
                        const n = Number(v) || 0;
                        updateExercise(i, 'durationSeconds', String(Math.min(59, n)));
                      }}
                      onBlur={() => {
                        if (ex.durationSeconds === 0 || isNaN(ex.durationSeconds)) {
                          updateExercise(i, 'durationSeconds', '0');
                        }
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  {/* Reps */}
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
                  {/* Weight */}
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
                </>
              )}
            </View>

            {ex.exerciseType === 'Sets of Reps' && (
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
            )}
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
          style={[styles.aiSuggestButton, (aiLoading || loading || aiUsesLeft <= 0) && styles.aiSuggestButtonDisabled]}
          onPress={handleAISuggest}
          disabled={aiLoading || loading || aiUsesLeft <= 0}
          activeOpacity={0.8}
        >
          {aiLoading ? (
            <ActivityIndicator color="#4ea8de" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={aiUsesLeft <= 0 ? '#444' : '#4ea8de'} />
              <Text style={[styles.aiSuggestButtonText, aiUsesLeft <= 0 && styles.aiSuggestButtonTextDisabled]}>
                {aiUsesLeft > 0 ? `Balance Workout with AI (${aiUsesLeft} left)` : 'No AI uses left today'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {id && (
          <Modal visible={showDeleteConfirm} transparent animationType="fade">
            <View style={styles.deleteModalOverlay}>
              <View style={styles.deleteModalCard}>
                <Text style={styles.deleteModalTitle}>Delete Workout</Text>
                <Text style={styles.deleteModalMessage}>Are you sure you want to delete this workout? This cannot be undone.</Text>
                <View style={styles.deleteModalActions}>
                  <TouchableOpacity
                    style={styles.deleteModalCancelButton}
                    onPress={() => setShowDeleteConfirm(false)}
                    activeOpacity={0.8}>
                    <Text style={styles.deleteModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteModalConfirmButton}
                    onPress={handleDelete}
                    activeOpacity={0.8}>
                    <Text style={styles.deleteModalConfirmText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        <View style={id ? styles.saveRow : undefined}>
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
          {id && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => setShowDeleteConfirm(true)}
              activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={26} color="#e54242" />
            </TouchableOpacity>
          )}
        </View>
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
  exerciseTypeLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseTypeDropdown: {
    marginBottom: 12,
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
    flex: 1,
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
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteButton: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  deleteModalCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  deleteModalMessage: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  deleteModalConfirmButton: {
    flex: 1,
    backgroundColor: '#e54242',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  aiSuggestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0d1e2e',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1a3a56',
  },
  aiSuggestButtonDisabled: {
    backgroundColor: '#141414',
    borderColor: '#2a2a2a',
  },
  aiSuggestButtonText: {
    color: '#4ea8de',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  aiSuggestButtonTextDisabled: {
    color: '#444',
  },
  nameDropdown: {
    marginBottom: 12,
  },
  exerciseNameDropdown: {
    marginBottom: 12,
  },
});
