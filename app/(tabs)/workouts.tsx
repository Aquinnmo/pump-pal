import { Workout, WorkoutCard } from '@/components/workout-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

const PAGE_SIZE = 50;
const FADE_HEIGHT = 24;

export default function WorkoutsScreen() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);

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
      setPage(0);
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

  const currentPageWorkouts = workouts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatDate = (d: any) => {
    if (!d) return '';
    try {
      let dt: Date;
      if (d.toDate && typeof d.toDate === 'function') dt = d.toDate();
      else if (typeof d === 'number') dt = new Date(d);
      else dt = new Date(d);
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#e54242" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>All Workouts</Text>
        <View style={styles.headerSpacer} />
      </View>

      {workouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barbell-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to log your first workout</Text>
        </View>
      ) : (
        <>
          <View style={styles.listWrapper} onLayout={(e) => setLayoutHeight(e.nativeEvent.layout.height)}>
            <FlatList
              style={{ flex: 1 }}
              data={workouts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <WorkoutCard workout={item} onDelete={handleDelete} onEdit={handleEdit} />
              )}
              contentContainerStyle={[styles.list, { paddingTop: FADE_HEIGHT, paddingBottom: 12 + FADE_HEIGHT }]}
              showsVerticalScrollIndicator={false}
              onScroll={(e: any) => setScrollY(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
              onContentSizeChange={(_, h) => setContentHeight(h)}
            />

            <View pointerEvents="none" style={[styles.fadeTop, { opacity: scrollY <= 4 ? 0 : 1 }]}>
              <LinearGradient
                colors={[/* background to transparent */ '#0f0f0f', 'transparent']}
                style={{ flex: 1 }}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </View>

            <View pointerEvents="none" style={[styles.fadeBottom, { opacity: scrollY + layoutHeight >= contentHeight - 4 ? 0 : 1 }]}>
              <LinearGradient
                colors={['transparent', '#0f0f0f']}
                style={{ flex: 1 }}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </View>

            
          </View>
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={page === 0 ? '#444' : '#e54242'} />
              <Text style={[styles.pageButtonText, page === 0 && styles.pageButtonTextDisabled]}>Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pageIndicator}>
              {currentPageWorkouts.length > 0
                ? `${formatDate(currentPageWorkouts[0].date)} to ${formatDate(currentPageWorkouts[currentPageWorkouts.length - 1].date)}`
                : ''}
            </Text>
            <TouchableOpacity
              style={[styles.pageButton, (page + 1) * PAGE_SIZE >= workouts.length && styles.pageButtonDisabled]}
              onPress={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= workouts.length}
              activeOpacity={0.7}>
              <Text style={[styles.pageButtonText, (page + 1) * PAGE_SIZE >= workouts.length && styles.pageButtonTextDisabled]}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={(page + 1) * PAGE_SIZE >= workouts.length ? '#444' : '#e54242'} />
            </TouchableOpacity>
          </View>
        </>
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 2,
  },
  backButtonText: {
    color: '#e54242',
    fontSize: 15,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 70,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  list: {
    paddingBottom: 8,
  },
  listWrapper: {
    flex: 1,
    position: 'relative',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 12,
  },
  pageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 2,
  },
  pageButtonDisabled: {
    borderColor: '#1a1a1a',
  },
  pageButtonText: {
    color: '#e54242',
    fontSize: 14,
    fontWeight: '600',
  },
  pageButtonTextDisabled: {
    color: '#444',
  },
  pageIndicator: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
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
