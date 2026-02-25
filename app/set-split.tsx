import { db } from '@/config/firebase';
import { SPLIT_OPTIONS, SplitOption } from '@/constants/split-options';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function SetSplitScreen() {
  const { user } = useAuth();
  const [selectedSplit, setSelectedSplit] = useState<SplitOption>('Push / Pull / Legs');
  const [customSplit, setCustomSplit] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelectSplit = () => {
    Alert.alert(
      'Select Your Split',
      undefined,
      [
        ...SPLIT_OPTIONS.map((option) => ({
          text: option,
          onPress: () => {
            setSelectedSplit(option);
            if (option !== 'Other') {
              setCustomSplit('');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleContinue = async () => {
    if (!user) return;

    const trimmedCustom = customSplit.trim();
    if (selectedSplit === 'Other' && !trimmedCustom) {
      Alert.alert('Missing split', 'Please describe your split to continue.');
      return;
    }

    setSaving(true);
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

      router.replace('/(tabs)');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not save your split. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Set Your Split</Text>
        <Text style={styles.subtitle}>Choose your typical workout split to personalize PumpPal.</Text>

        <TouchableOpacity style={styles.dropdownRow} onPress={handleSelectSplit}>
          <Text style={styles.dropdownText}>{selectedSplit}</Text>
          <Ionicons name="chevron-down" size={18} color="#888" />
        </TouchableOpacity>

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
          style={[styles.continueButton, saving && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  content: {
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 10,
  },
  dropdownRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    color: '#ddd',
    fontSize: 15,
  },
  customInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  continueButton: {
    backgroundColor: '#e54242',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});