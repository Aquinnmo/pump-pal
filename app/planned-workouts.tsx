import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { useAuth } from '@/context/auth-context';
import { Workout } from '@/types/workout';
import { showAlert } from '@/utils/alert';
import { generateSplitWorkoutNames } from '@/utils/gemini-workout-suggestions';
import { predictWorkoutAfterName } from '@/utils/predict-next-workout';
import { exerciseLabel, summarizePerformedExerciseSetGroups } from '@/utils/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PlannedWorkoutsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Workout[]>([]);
  const [splitNames, setSplitNames] = useState<string[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [snapshot, userSnap, historySnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'workouts'),
            where('userId', '==', user.uid),
            where('status', '==', 'planned'),
            orderBy('queueOrder')
          )
        ),
        getDoc(doc(db, 'users', user.uid)),
        getDocs(
          query(
            collection(db, 'workouts'),
            where('userId', '==', user.uid),
            orderBy('date', 'desc'),
            limit(30)
          )
        ),
      ]);

      const loadedPlans = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
      const history = historySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
      const splitType = userSnap.data()?.workoutSplit?.type;
      const customSplitDesc: string = userSnap.data()?.workoutSplit?.custom ?? '';
      let loadedSplitNames: string[] = isSplitOption(splitType) ? SPLIT_WORKOUT_NAMES[splitType] : [];

      if (splitType === 'Other' && customSplitDesc) {
        const cacheKey = `pumppal_split_names_v2_${customSplitDesc.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          try { loadedSplitNames = JSON.parse(cached); } catch { /* ignore */ }
        } else {
          try {
            const generated = await generateSplitWorkoutNames(customSplitDesc);
            if (generated.length > 0) {
              loadedSplitNames = generated;
              await AsyncStorage.setItem(cacheKey, JSON.stringify(generated));
            }
          } catch { /* modal still allows a custom workout name */ }
        }
      }

      setPlans(loadedPlans);
      setSplitNames(loadedSplitNames);
      setWorkoutHistory(history);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [loadPlans])
  );

  const nextWorkoutToPlan = useMemo(
    () => predictWorkoutAfterName(splitNames, workoutHistory, plans[plans.length - 1]?.name),
    [plans, splitNames, workoutHistory]
  );

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= plans.length) return;
    const a = plans[index];
    const b = plans[target];
    const reordered = [...plans];
    reordered[index] = b;
    reordered[target] = a;
    setPlans(reordered);
    try {
      await Promise.all([
        updateDoc(doc(db, 'workouts', a.id), { queueOrder: b.queueOrder }),
        updateDoc(doc(db, 'workouts', b.id), { queueOrder: a.queueOrder }),
      ]);
    } catch (err) {
      console.error(err);
      loadPlans();
    }
  };

  const handleDelete = async (planId: string) => {
    try {
      await deleteDoc(doc(db, 'workouts', planId));
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch (err: any) {
      showAlert('Error', 'Could not delete plan. ' + err.message);
    } finally {
      setDeleteTargetId(null);
    }
  };

  const openNewPlan = () => {
    router.push({
      pathname: '/modal',
      params: { mode: 'plan', ...(nextWorkoutToPlan ? { suggestion: nextWorkoutToPlan } : {}) },
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Planned Workouts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e54242" size="large" />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={56} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>No plans queued</Text>
          <Text style={styles.emptySubtitle}>
            Planning is optional — queue up a workout whenever it&apos;s useful.
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={openNewPlan}
            activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={18} color="#e54242" />
            <Text style={styles.addButtonText}>Plan New Workout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {plans.map((plan, index) => (
            <View key={plan.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{plan.name}</Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/modal', params: { mode: 'plan', id: plan.id } })}
                    hitSlop={8}
                    style={styles.editButton}>
                    <Text style={styles.editText}>Edit</Text>
                    <Ionicons name="pencil-outline" size={20} color="#666" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteTargetId(plan.id)} hitSlop={8} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={22} color="#666" />
                  </TouchableOpacity>
                </View>
              </View>

              {(plan.performedExercises ?? []).length > 0 ? (
                <View style={styles.exerciseList}>
                  {(plan.performedExercises ?? []).map((pe, i) => (
                    <View key={i} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{exerciseLabel(pe)}</Text>
                      <View style={styles.exerciseDetails}>
                        {summarizePerformedExerciseSetGroups(pe).map((setSummary, setIndex) => (
                          <Text key={setIndex} style={styles.exerciseSummary}>{setSummary}</Text>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.exerciseLineEmpty}>No exercises added yet</Text>
              )}

              <View style={styles.reorderRow}>
                <TouchableOpacity
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  hitSlop={8}
                  style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}>
                  <Ionicons name="chevron-up" size={18} color={index === 0 ? '#333' : '#fff'} />
                </TouchableOpacity>
                <Text style={styles.queuePosition}>
                  {index === 0 ? 'Up next' : `#${index + 1} in queue`}
                </Text>
                <TouchableOpacity
                  onPress={() => move(index, 1)}
                  disabled={index === plans.length - 1}
                  hitSlop={8}
                  style={[styles.reorderButton, index === plans.length - 1 && styles.reorderButtonDisabled]}>
                  <Ionicons name="chevron-down" size={18} color={index === plans.length - 1 ? '#333' : '#fff'} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addExButton}
            onPress={openNewPlan}
            activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={18} color="#e54242" />
            <Text style={styles.addExText}>Plan New Workout</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {deleteTargetId && (
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalTitle}>Delete Plan</Text>
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete this planned workout? This cannot be undone.
            </Text>
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={() => setDeleteTargetId(null)}
                activeOpacity={0.8}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalConfirmButton}
                onPress={() => handleDelete(deleteTargetId)}
                activeOpacity={0.8}>
                <Text style={styles.deleteModalConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
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
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#444',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#271515',
    borderWidth: 1,
    borderColor: '#e54242',
    borderRadius: 10,
    marginTop: 8,
  },
  addButtonText: {
    color: '#e54242',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    padding: 20,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  deleteButton: {
    padding: 6,
  },
  exerciseList: {
    gap: 8,
    marginBottom: 12,
  },
  exerciseRow: {
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  exerciseDetails: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 4,
    minWidth: 120,
  },
  exerciseSummary: {
    fontSize: 13,
    color: '#e54242',
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'right',
  },
  exerciseLineEmpty: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    backgroundColor: '#181818',
  },
  queuePosition: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addExButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#271515',
    borderWidth: 1,
    borderColor: '#e54242',
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  addExText: {
    color: '#e54242',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  deleteModalOverlay: {
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
});
