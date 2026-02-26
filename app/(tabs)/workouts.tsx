import { Workout, WorkoutCard } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function WorkoutsScreen() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users', user.uid, 'workouts'),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
      setWorkouts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts])
  );

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setShowDeleteModal(false);
    try {
      await deleteDoc(doc(db, 'users', user!.uid, 'workouts', pendingDeleteId));
      setWorkouts((prev) => prev.filter((w) => w.id !== pendingDeleteId));
    } catch {
      // silently fail
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleEdit = (workout: Workout) => {
    router.push({ pathname: '/modal', params: { id: workout.id } });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Workout</Text>
            <Text style={styles.modalMessage}>Are you sure you want to delete this workout? This cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => { setShowDeleteModal(false); setPendingDeleteId(null); }}
                activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmDelete}
                activeOpacity={0.8}>
                <Text style={styles.modalConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Workouts</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/modal')}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {workouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barbell-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to log your first workout</Text>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WorkoutCard workout={item} onDelete={handleDelete} onEdit={handleEdit} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#e54242',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#444',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#555',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: '#888',
    marginBottom: 24,
    lineHeight: 21,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e54242',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
