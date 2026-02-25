import { Dropdown } from '@/components/ui/dropdown';
import { Toast } from '@/components/ui/toast';
import { db } from '@/config/firebase';
import { SPLIT_OPTIONS, SplitOption, isSplitOption } from '@/constants/split-options';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function ProfileScreen() {
  const { user, logOut } = useAuth();
  const [selectedSplit, setSelectedSplit] = useState<SplitOption>('Push / Pull / Legs');
  const [customSplit, setCustomSplit] = useState('');
  const [loadingSplit, setLoadingSplit] = useState(true);
  const [savingSplit, setSavingSplit] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({  
    visible: false,
    message: '',
    type: 'success',
  });

  useEffect(() => {
    if (!user) return;

    const loadSplit = async () => {
      setLoadingSplit(true);
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        const split = snapshot.data()?.workoutSplit;

        if (isSplitOption(split?.type)) {
          setSelectedSplit(split.type);
        }

        if (typeof split?.custom === 'string') {
          setCustomSplit(split.custom);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSplit(false);
      }
    };

    loadSplit();
  }, [user]);

  const handleSignOut = () => setShowSignOutModal(true);

  const confirmSignOut = async () => {
    setShowSignOutModal(false);
    await logOut();
    router.replace('/(auth)/sign-in');
  };

  const handleSaveSplit = async () => {
    if (!user) return;

    const trimmedCustom = customSplit.trim();

    if (selectedSplit === 'Other' && !trimmedCustom) {
      showAlert('Missing split', 'Please describe your split in the text box.');
      return;
    }

    setSavingSplit(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          workoutSplit: {
            type: selectedSplit,
            custom: selectedSplit === 'Other' ? trimmedCustom : null,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      setToast({ visible: true, message: 'Workout split updated', type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not save split', type: 'error' });
    } finally {
      setSavingSplit(false);
    }
  };

  const initial = user?.displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.container}>
      <Modal visible={showSignOutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSignOutModal(false)}
                activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmSignOut}
                activeOpacity={0.8}>
                <Text style={styles.modalConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <Text style={styles.title}>Profile</Text>

      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.displayName}>{user?.displayName ?? 'Athlete'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={() => router.push('/(tabs)/workouts')}>
          <Ionicons name="barbell-outline" size={20} color="#e54242" style={styles.rowIcon} />
          <Text style={styles.rowLabel}>My Workouts</Text>
          <Ionicons name="chevron-forward" size={18} color="#555" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}> 
        <View style={styles.splitHeader}>
          <Text style={styles.splitTitle}>Workout Split</Text>
          {loadingSplit ? <ActivityIndicator size="small" color="#e54242" /> : null}
        </View>

        <Dropdown
          options={SPLIT_OPTIONS}
          value={selectedSplit}
          onSelect={(val) => {
            setSelectedSplit(val as SplitOption);
            if (val !== 'Other') setCustomSplit('');
          }}
          placeholder="Select Your Split"
          style={styles.dropdownRow}
        />

        {selectedSplit === 'Other' && (
          <TextInput
            style={styles.customInput}
            placeholder="Describe your split"
            placeholderTextColor="#777"
            value={customSplit}
            onChangeText={setCustomSplit}
          />
        )}

        <TouchableOpacity
          style={[styles.saveButton, savingSplit && styles.saveButtonDisabled]}
          onPress={handleSaveSplit}
          disabled={savingSplit || loadingSplit}>
          {savingSplit ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Split</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#e54242" style={styles.rowIcon} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 32,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e54242',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#888',
  },
  section: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  splitTitle: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  dropdownRow: {
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  customInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 10,
    backgroundColor: '#e54242',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
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
