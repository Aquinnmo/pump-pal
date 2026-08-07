import { TimberAuthShell, TimberBrand, timberAuthStyles } from '@/components/timber-auth-shell';
import { notifyAccountDataChanged } from '@/db/initial-sync';
import { profileRepository } from '@/db/profile-repository';
import { patchProfile } from '@/repositories/remote/profile';
import { isValidUsername, slugifyUsername } from '@/shared/username';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { ApiValidationError } from '@/utils/api-client';
import { updateProfile as updateAuthProfile } from 'firebase/auth';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

export default function SetUsernameScreen() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName) setUsername(slugifyUsername(user.displayName));
  }, [user?.displayName]);

  const handleContinue = async () => {
    if (!user) return;

    const trimmed = username.trim();
    if (!isValidUsername(trimmed)) {
      setError('3-20 characters: letters, digits, underscore, starting with a letter.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const dto = await patchProfile({ username: trimmed });
      const current = await profileRepository.get(user.uid);
      await profileRepository.upsert(user.uid, { ...(current?.data ?? {}), username: dto.username ?? trimmed, usernameLower: trimmed.toLowerCase() });
      if (!user.displayName) await updateAuthProfile(user, { displayName: trimmed });
      notifyAccountDataChanged();
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiValidationError && err.code === 'username_taken') {
        setError('That username is taken. Try another.');
      } else {
        console.error(err);
        showAlert('Error', 'Could not save your username. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <TimberAuthShell>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TimberBrand eyebrow="Pick a username" subtitle="This is how other lifters will find and see you." />

          <View style={styles.card}>
            <Text style={styles.title}>Claim your username</Text>
            <Text style={styles.subtitle}>Unique to you — you can change it later in Settings.</Text>

            <TextInput
              style={timberAuthStyles.field}
              placeholder="Username"
              placeholderTextColor="#9f9a92"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              accessibilityLabel="Save username"
              style={[timberAuthStyles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={timberAuthStyles.primaryButtonText}>Continue</Text>}
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
  errorText: {
    color: '#f87171',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
