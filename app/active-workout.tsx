import { Dropdown } from '@/components/ui/dropdown';
import { ExercisePicker, ExercisePickerSelection } from '@/components/ui/exercise-picker';
import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { useAuth } from '@/context/auth-context';
import { useExerciseCatalog } from '@/hooks/use-exercise-catalog';
import { DraftExerciseRow, DraftSet, ExerciseType, PerformedExercise, Workout } from '@/types/workout';
import { showAlert } from '@/utils/alert';
import { createPendingExercise } from '@/utils/create-pending-exercise';
import { generateSplitWorkoutNames } from '@/utils/workout-suggestions';
import { buildPerformedExercise, collapseSetsToDraft, toDateObj, workoutTotalReps, workoutVolume } from '@/utils/workout-conversion';
import {
  dismissWorkoutNotification,
  ensureWorkoutChannel,
  requestNotificationPermission,
  showWorkoutNotification,
} from '@/utils/workout-notification';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const EXERCISE_TYPES = ['Sets of Reps', 'Sets of Duration'] as const;

const blankSet = (): DraftSet => ({ reps: 10, weight: '', durationMinutes: 0, durationSeconds: 30, completed: false });

const blankRow = (): DraftExerciseRow => ({
  exerciseId: null,
  variationId: null,
  label: '',
  exerciseType: 'Sets of Reps',
  bodyweight: false,
  sets: [blankSet()],
});

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function ActiveWorkoutScreen() {
  const { user } = useAuth();
  const { id, suggestion } = useLocalSearchParams<{ id: string; suggestion: string }>();
  const insets = useSafeAreaInsets();
  const { options: catalogOptions } = useExerciseCatalog();

  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [cameFromPlan, setCameFromPlan] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [workoutName, setWorkoutName] = useState('');
  const [isCustomWorkoutName, setIsCustomWorkoutName] = useState(false);
  const [customWorkoutName, setCustomWorkoutName] = useState('');
  const [workoutNameOptions, setWorkoutNameOptions] = useState<string[]>([]);
  const [exercises, setExercises] = useState<DraftExerciseRow[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const hydrated = useRef(false);

  useEffect(() => {
    if (!user || hydrated.current) return;
    hydrated.current = true;

    (async () => {
      try {
        if (id) {
          const ref = doc(db, 'workouts', id);
          const snap = await getDoc(ref);
          if (!snap.exists() || snap.data().userId !== user.uid) {
            showAlert('Error', 'Could not load workout.');
            router.back();
            return;
          }
          const data = snap.data() as Workout;
          setWorkoutName(data.name || '');
          setExercises(
            data.performedExercises && data.performedExercises.length > 0
              ? data.performedExercises.map(collapseSetsToDraft)
              : [blankRow()]
          );
          // queueOrder is only ever set on docs that passed through the planned
          // queue — it's left in place through the in_progress transition, so
          // its presence tells us how "discard" should behave even on resume.
          setCameFromPlan(data.queueOrder !== undefined);
          if (data.status === 'planned') {
            await updateDoc(ref, { status: 'in_progress', startedAt: serverTimestamp() });
            setStartedAt(new Date());
          } else {
            setStartedAt(data.startedAt ? toDateObj(data.startedAt) : new Date());
          }
          setWorkoutId(id);
        } else {
          const name = suggestion || '';
          const newDoc = await addDoc(collection(db, 'workouts'), {
            userId: user.uid,
            name,
            performedExercises: [],
            status: 'in_progress',
            startedAt: serverTimestamp(),
            schemaVersion: 2,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setWorkoutId(newDoc.id);
          setWorkoutName(name);
          setCameFromPlan(false);
          setStartedAt(new Date());
        }
      } catch (err: any) {
        showAlert('Error', 'Could not start workout. ' + err.message);
        router.back();
      } finally {
        setInitializing(false);
      }
    })();
  }, [user, id, suggestion]);

  // Build the workout-name dropdown: the user's split day names first, then any
  // other names they've actually used. Mirrors the same list the add/plan modal shows.
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const data = userSnap.data();
        const splitType = data?.workoutSplit?.type;
        const customSplitDesc: string = data?.workoutSplit?.custom ?? '';
        let splitNames: string[] = isSplitOption(splitType) ? SPLIT_WORKOUT_NAMES[splitType] : [];

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

        const workoutsSnap = await getDocs(
          query(collection(db, 'workouts'), where('userId', '==', user.uid), orderBy('date', 'desc'))
        );
        const merged = [...splitNames];
        workoutsSnap.docs.forEach((d) => {
          const name = d.data().name;
          if (name && !merged.includes(name)) merged.push(name);
        });
        setWorkoutNameOptions(merged);
      } catch {
        // silently fail — user can still type a name
      }
    })();
  }, [user]);

  // Elapsed-time ticker
  useEffect(() => {
    if (!startedAt) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  // Prepare the Android notification channel + permission once a workout is live.
  useEffect(() => {
    if (!startedAt) return;
    (async () => {
      await ensureWorkoutChannel();
      await requestNotificationPermission();
    })();
  }, [startedAt]);

  const effectiveWorkoutName = isCustomWorkoutName ? customWorkoutName.trim() : workoutName.trim();

  // A resumed workout may carry a one-off name that predates the split list —
  // surface it so the dropdown can show it as the current selection.
  const nameOptions = useMemo(() => {
    const merged = [...workoutNameOptions];
    if (workoutName && !isCustomWorkoutName && !merged.includes(workoutName)) merged.unshift(workoutName);
    return [...merged, 'Other'];
  }, [workoutNameOptions, workoutName, isCustomWorkoutName]);

  const selectWorkoutName = (selected: string) => {
    if (selected === 'Other') {
      setIsCustomWorkoutName(true);
      setWorkoutName('Other');
      return;
    }
    setIsCustomWorkoutName(false);
    setWorkoutName(selected);
    setCustomWorkoutName('');
  };

  // Debounced autosave — keeps the doc resumable if the app is closed mid-workout
  useEffect(() => {
    if (!workoutId || initializing) return;
    const t = setTimeout(() => {
      const performedExercises: PerformedExercise[] = exercises
        .filter((ex) => ex.label.trim() !== '')
        .map((ex, order) => buildPerformedExercise(ex, order));
      updateDoc(doc(db, 'workouts', workoutId), {
        name: effectiveWorkoutName,
        performedExercises,
        updatedAt: serverTimestamp(),
      }).catch(() => { /* best-effort autosave */ });

      // Refresh the live Android notification with completed-set metrics.
      if (startedAt) {
        const started = exercises.filter((ex) => ex.label.trim() !== '');
        const completed: PerformedExercise[] = started
          .map((ex, order) => buildPerformedExercise({ ...ex, sets: ex.sets.filter((s) => s.completed) }, order))
          .filter((pe) => pe.sets.length > 0);
        const metricsSource = { performedExercises: completed } as Workout;
        // Current exercise = the one owning the next set after the last completed
        // set (in workout order). No completed sets yet → the very first set.
        const flat: { label: string; completed: boolean }[] = [];
        started.forEach((ex) => ex.sets.forEach((s) => flat.push({ label: ex.label, completed: !!s.completed })));
        let lastCompleted = -1;
        flat.forEach((f, i) => { if (f.completed) lastCompleted = i; });
        const currentExercise = flat[lastCompleted + 1]?.label ?? null;
        showWorkoutNotification({
          name: effectiveWorkoutName || 'Workout in progress',
          startedAt,
          sets: completed.reduce((n, pe) => n + pe.sets.length, 0),
          totalReps: workoutTotalReps(metricsSource),
          volume: workoutVolume(metricsSource),
          currentExercise,
        });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [exercises, effectiveWorkoutName, workoutId, initializing, startedAt]);

  const addExercise = () => setExercises((prev) => [...prev, blankRow()]);

  const selectExercise = (i: number, selection: ExercisePickerSelection) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, exerciseId: selection.exerciseId, variationId: selection.variationId, label: selection.label } : ex
      )
    );

  const toggleBodyweight = (i: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i ? { ...ex, bodyweight: !ex.bodyweight, sets: ex.sets.map((s) => ({ ...s, weight: '' })) } : ex
      )
    );

  const removeExercise = (i: number) => setExercises((prev) => prev.filter((_, idx) => idx !== i));

  const updateExerciseField = (i: number, field: 'exerciseType', value: ExerciseType) =>
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));

  const updateSet = (i: number, setIdx: number, field: 'weight' | 'durationMinutes' | 'durationSeconds', value: string) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, si) => {
            if (si !== setIdx) return s;
            if (field === 'weight') return { ...s, weight: value };
            const n = Number(value) || 0;
            return { ...s, [field]: field === 'durationSeconds' ? Math.min(59, n) : n };
          }),
        };
      })
    );

  const incrementSet = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return { ...ex, sets: ex.sets.map((s, si) => (si === setIdx ? { ...s, reps: s.reps + 1 } : s)) };
      })
    );

  const decrementSet = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return { ...ex, sets: ex.sets.map((s, si) => (si === setIdx ? { ...s, reps: Math.max(0, s.reps - 1) } : s)) };
      })
    );

  const addSet = (i: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        const last = ex.sets[ex.sets.length - 1] ?? blankSet();
        return { ...ex, sets: [...ex.sets, { ...last, completed: false }] };
      })
    );

  const removeSet = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i || ex.sets.length <= 1) return ex;
        return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
      })
    );

  const toggleSetComplete = (i: number, setIdx: number) =>
    setExercises((prev) =>
      prev.map((ex, idx) => {
        if (idx !== i) return ex;
        return { ...ex, sets: ex.sets.map((s, si) => (si === setIdx ? { ...s, completed: !s.completed } : s)) };
      })
    );

  const incompleteSetCount = () =>
    exercises
      .filter((ex) => ex.label.trim() !== '')
      .reduce((sum, ex) => sum + ex.sets.filter((s) => !s.completed).length, 0);

  const finishWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      const performedExercises: PerformedExercise[] = exercises
        .filter((ex) => ex.label.trim() !== '')
        .map((ex, order) => buildPerformedExercise({ ...ex, sets: ex.sets.filter((s) => s.completed) }, order))
        .filter((pe) => pe.sets.length > 0)
        .map((pe) => ({ ...pe, sets: pe.sets.map(({ completed, ...rest }) => rest) }));

      await updateDoc(doc(db, 'workouts', workoutId), {
        name: effectiveWorkoutName || 'Workout',
        date: Timestamp.fromDate(new Date()),
        performedExercises,
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
      await dismissWorkoutNotification();
      router.replace('/(tabs)');
    } catch (err: any) {
      showAlert('Error', 'Could not finish workout. ' + err.message);
    } finally {
      setSaving(false);
      setShowFinishConfirm(false);
    }
  };

  const handleFinishPress = () => {
    if (incompleteSetCount() > 0) {
      setShowFinishConfirm(true);
    } else {
      finishWorkout();
    }
  };

  const discardWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      if (cameFromPlan) {
        const performedExercises: PerformedExercise[] = exercises
          .filter((ex) => ex.label.trim() !== '')
          .map((ex, order) => buildPerformedExercise(ex, order))
          .map((pe) => ({ ...pe, sets: pe.sets.map(({ completed, ...rest }) => rest) }));
        await updateDoc(doc(db, 'workouts', workoutId), {
          status: 'planned',
          performedExercises,
          startedAt: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, 'workouts', workoutId));
      }
      await dismissWorkoutNotification();
      router.replace('/(tabs)');
    } catch (err: any) {
      showAlert('Error', 'Could not discard workout. ' + err.message);
    } finally {
      setSaving(false);
      setShowDiscardConfirm(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => setShowDiscardConfirm(true)} hitSlop={8}>
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{effectiveWorkoutName || 'Active Workout'}</Text>
          <Text style={styles.headerTimer}>{formatElapsed(elapsed)}</Text>
        </View>
        <TouchableOpacity onPress={handleFinishPress} disabled={saving}>
          {saving ? <ActivityIndicator color="#e54242" /> : <Text style={styles.finishText}>Finish</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {workoutNameOptions.length > 0 ? (
          <>
            <Dropdown
              options={nameOptions}
              value={isCustomWorkoutName ? 'Other' : (workoutName || null)}
              onSelect={selectWorkoutName}
              placeholder="Select workout name"
              style={styles.nameDropdown}
            />
            {isCustomWorkoutName && (
              <TextInput
                style={styles.nameInput}
                placeholder="Enter workout name"
                placeholderTextColor="#555"
                value={customWorkoutName}
                onChangeText={setCustomWorkoutName}
              />
            )}
          </>
        ) : (
          <TextInput
            style={styles.nameInput}
            placeholder="Workout name (e.g. Push Day)"
            placeholderTextColor="#555"
            value={isCustomWorkoutName ? customWorkoutName : workoutName}
            onChangeText={(v) => {
              setIsCustomWorkoutName(true);
              setCustomWorkoutName(v);
            }}
          />
        )}

        {exercises.map((ex, i) => {
          const allSetsComplete = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
          return (
          <View key={i} style={[styles.exerciseCard, allSetsComplete && styles.exerciseCardComplete]}>
            <ExercisePicker
              options={catalogOptions}
              value={ex.label || null}
              recentExercises={[]}
              onSelect={(selection) => selectExercise(i, selection)}
              onCreateNew={user ? (name) => createPendingExercise(name, user.uid) : undefined}
              placeholder="Select exercise"
              style={styles.exerciseNameDropdown}
            />

            <Dropdown
              options={EXERCISE_TYPES}
              value={ex.exerciseType}
              onSelect={(v) => updateExerciseField(i, 'exerciseType', v as ExerciseType)}
              placeholder="Type of exercise"
              style={styles.exerciseTypeDropdown}
            />

            {ex.sets.map((set, si) => (
              <View key={si} style={[styles.setRow, set.completed && !allSetsComplete && styles.setRowComplete]}>
                <View style={styles.setCheckboxWrap}>
                  <Text style={styles.deleteSetSpacer}> </Text>
                  <View style={styles.setCheckboxIconWrap}>
                    <TouchableOpacity
                      onPress={() => toggleSetComplete(i, si)}
                      hitSlop={8}
                      style={[styles.setCheckbox, set.completed && styles.setCheckboxChecked]}>
                      {set.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.row}>
                  {ex.exerciseType === 'Sets of Duration' ? (
                    <>
                      <View style={styles.numField}>
                        <Text style={styles.numLabel}>Minutes</Text>
                        <TextInput
                          style={styles.numInput}
                          keyboardType="number-pad"
                          value={String(set.durationMinutes)}
                          onChangeText={(v) => updateSet(i, si, 'durationMinutes', v)}
                        />
                      </View>
                      <View style={styles.numField}>
                        <Text style={styles.numLabel}>Seconds</Text>
                        <TextInput
                          style={styles.numInput}
                          keyboardType="number-pad"
                          value={String(set.durationSeconds)}
                          onChangeText={(v) => updateSet(i, si, 'durationSeconds', v)}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.numField}>
                        <Text style={styles.numLabel}>Reps</Text>
                        <View style={styles.incrementerContainerHorizontal}>
                          <TouchableOpacity onPress={() => decrementSet(i, si)} hitSlop={10}>
                            <Ionicons name="remove-circle" size={28} color="#e54242" />
                          </TouchableOpacity>
                          <Text style={styles.incrementerValue}>{set.reps}</Text>
                          <TouchableOpacity onPress={() => incrementSet(i, si)} hitSlop={10}>
                            <Ionicons name="add-circle" size={28} color="#e54242" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {!ex.bodyweight && (
                        <View style={styles.numField}>
                          <Text style={styles.numLabel}>Weight (lbs)</Text>
                          <View style={styles.weightInputContainer}>
                            <TextInput
                              style={[styles.numInput, styles.weightInput]}
                              keyboardType="decimal-pad"
                              value={set.weight}
                              onChangeText={(v) => updateSet(i, si, 'weight', v)}
                              onBlur={() => {
                                if (set.weight === '' || set.weight === '.') updateSet(i, si, 'weight', '0');
                              }}
                            />
                          </View>
                        </View>
                      )}
                    </>
                  )}
                  {ex.sets.length > 1 && (
                    <View style={styles.deleteSetButton}>
                      <Text style={styles.deleteSetSpacer}> </Text>
                      <TouchableOpacity style={styles.deleteSetIconWrap} onPress={() => removeSet(i, si)} hitSlop={12}>
                        <Ionicons name="close-circle" size={26} color="#888" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(i)}>
              <Ionicons name="add-circle-outline" size={20} color="#e54242" />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>

            <View style={styles.exerciseFooter}>
              {ex.exerciseType === 'Sets of Reps' ? (
                <TouchableOpacity style={styles.bodyweightRow} onPress={() => toggleBodyweight(i)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, ex.bodyweight && styles.checkboxChecked]}>
                    {ex.bodyweight && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={styles.bodyweightLabel}>Bodyweight exercise</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.exerciseFooterSpacer} />
              )}

              {exercises.length > 1 && (
                <TouchableOpacity style={styles.removeExerciseButton} onPress={() => removeExercise(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          );
        })}

        <TouchableOpacity style={styles.addExButton} onPress={addExercise}>
          <Ionicons name="add-circle-outline" size={18} color="#e54242" />
          <Text style={styles.addExText}>Add Exercise</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigFinishButton, saving && styles.bigFinishButtonDisabled]}
          onPress={handleFinishPress}
          disabled={saving}
          activeOpacity={0.8}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigFinishButtonText}>Finish Workout</Text>}
        </TouchableOpacity>
      </ScrollView>

      {showFinishConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sets incomplete</Text>
            <Text style={styles.confirmMessage}>
              {incompleteSetCount()} set{incompleteSetCount() !== 1 ? 's' : ''} not marked complete. They&apos;ll be
              dropped from this workout. Finish anyway?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setShowFinishConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmConfirmButton} onPress={finishWorkout} activeOpacity={0.8}>
                <Text style={styles.confirmConfirmText}>Finish Anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showDiscardConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{cameFromPlan ? 'Stop workout?' : 'Discard workout?'}</Text>
            <Text style={styles.confirmMessage}>
              {cameFromPlan
                ? 'This will move the workout back to your planned queue.'
                : 'This will delete the workout — it was never saved as a plan.'}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setShowDiscardConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.confirmCancelText}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmConfirmButton} onPress={discardWorkout} activeOpacity={0.8}>
                <Text style={styles.confirmConfirmText}>{cameFromPlan ? 'Stop' : 'Discard'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    backgroundColor: '#0f0f0f',
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  headerTimer: {
    fontSize: 12,
    color: '#e54242',
    fontWeight: '600',
    marginTop: 2,
  },
  finishText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e54242',
  },
  discardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  nameDropdown: {
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 16,
  },
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
  exerciseNameDropdown: {
    marginBottom: 12,
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
  weightInputContainer: {
    flex: 1,
  },
  weightInput: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 0,
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
  incrementerValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    paddingVertical: 4,
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
  addExButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#271515',
    borderWidth: 1,
    borderColor: '#e54242',
    borderRadius: 10,
    marginBottom: 16,
    gap: 6,
  },
  addExText: {
    color: '#e54242',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  bigFinishButton: {
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bigFinishButtonDisabled: {
    opacity: 0.5,
  },
  bigFinishButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  confirmCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  confirmConfirmButton: {
    flex: 1,
    backgroundColor: '#e54242',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
