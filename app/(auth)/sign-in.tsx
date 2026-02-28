import { useAuth } from '@/context/auth-context';
import { getFriendlyAuthError } from '@/utils/firebase-errors';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.logo}>PumpPal</Text>
        <Text style={styles.subtitle}>Your workout companion</Text>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color="#f87171" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/sign-up" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              Do not have an account? <Text style={styles.linkBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: '#e54242',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#e54242',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
  },
  linkBold: {
    color: '#e54242',
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a1515',
    borderWidth: 1,
    borderColor: '#5a2020',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
  },
});
