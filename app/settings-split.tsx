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
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsSplitScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedSplit, setSelectedSplit] = useState<SplitOption>('Push / Pull / Legs');
  const [customSplit, setCustomSplit] = useState('');
  const [loadingSplit, setLoadingSplit] = useState(true);
  const [savingSplit, setSavingSplit] = useState(false);
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split</Text>
        <View style={{ width: 24 }} />
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.content}>
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
      </View>
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
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
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
});
