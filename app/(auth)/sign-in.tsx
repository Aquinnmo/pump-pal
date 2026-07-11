import { TimberAuthShell, TimberBrand, timberAuthStyles } from '@/components/timber-auth-shell';
import { useAuth } from '@/context/auth-context';
import { getFriendlyAuthError } from '@/utils/firebase-errors';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
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

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <TimberAuthShell>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <TimberBrand eyebrow="Your workout log" subtitle="Your sessions, plans, and progress are waiting." />

          <View style={styles.formCard}>
            <Text style={styles.heading}>Pick up your log</Text>
            <Text style={styles.hint}>Sign in and keep building from your last session.</Text>

            {error && (
              <View style={[timberAuthStyles.errorBanner, styles.errorBanner]}>
                <Ionicons name="alert-circle" size={16} color="#f87171" style={styles.errorIcon} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.fields}>
              <TextInput
                style={timberAuthStyles.field}
                placeholder="Email"
                placeholderTextColor="#9f9a92"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={timberAuthStyles.field}
                placeholder="Password"
                placeholderTextColor="#9f9a92"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              accessibilityLabel="Sign in to Timber"
              style={[timberAuthStyles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={timberAuthStyles.primaryButtonText}>Sign In</Text>}
            </TouchableOpacity>

            <Link href="/(auth)/sign-up" asChild>
              <TouchableOpacity style={styles.linkButton}>
                <Text style={styles.linkText}>
                  New to Timber? <Text style={styles.linkBold}>Create Account</Text>
                </Text>
              </TouchableOpacity>
            </Link>
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
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  formCard: {
    marginTop: 30,
    padding: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 19, 18, 0.94)',
    borderWidth: 1,
    borderColor: '#4a3324',
  },
  heading: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  hint: {
    color: '#aaa39a',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  fields: {
    gap: 12,
  },
  errorBanner: {
    marginBottom: 14,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkButton: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 2,
  },
  linkText: {
    color: '#aaa39a',
    fontSize: 14,
  },
  linkBold: {
    color: '#c9a567',
    fontWeight: '800',
  },
});
