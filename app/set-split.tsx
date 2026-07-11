import { TimberAuthShell, TimberBrand, timberAuthStyles } from '@/components/timber-auth-shell';
import { Dropdown } from '@/components/ui/dropdown';
import { db } from '@/config/firebase';
import { SPLIT_OPTIONS, SplitOption } from '@/constants/split-options';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
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

export default function SetSplitScreen() {
  const { user } = useAuth();
  const [selectedSplit, setSelectedSplit] = useState<SplitOption>('Push / Pull / Legs');
  const [customSplit, setCustomSplit] = useState('');
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!user) return;

    const trimmedCustom = customSplit.trim();
    if (selectedSplit === 'Other' && !trimmedCustom) {
      showAlert('Missing split', 'Please describe your split to continue.');
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
      showAlert('Error', 'Could not save your split. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TimberAuthShell>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TimberBrand eyebrow="One last thing" subtitle="Set your usual routine before you start logging." />

          <View style={styles.card}>
            <Text style={styles.title}>Set your training roots</Text>
            <Text style={styles.subtitle}>
              Choose the split you use most. You can still plan or log any workout you want.
            </Text>

            <Dropdown
              options={SPLIT_OPTIONS}
              value={selectedSplit}
              onSelect={(value) => {
                setSelectedSplit(value as SplitOption);
                if (value !== 'Other') setCustomSplit('');
              }}
              placeholder="Select Your Split"
              style={styles.dropdown}
            />

            {selectedSplit === 'Other' && (
              <TextInput
                style={[timberAuthStyles.field, styles.customInput]}
                placeholder="Describe your split"
                placeholderTextColor="#9f9a92"
                value={customSplit}
                onChangeText={setCustomSplit}
              />
            )}

            <TouchableOpacity
              accessibilityLabel="Save workout split"
              style={[timberAuthStyles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={timberAuthStyles.primaryButtonText}>Save My Split</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TimberAuthShell>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  card: {
    marginTop: 30,
    padding: 20,
    gap: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 19, 18, 0.94)',
    borderWidth: 1,
    borderColor: '#4a3324',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#aaa39a',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  dropdown: {
    borderColor: '#4a3324',
    backgroundColor: '#181716',
    borderRadius: 14,
    paddingVertical: 15,
  },
  customInput: {
    marginTop: -2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
