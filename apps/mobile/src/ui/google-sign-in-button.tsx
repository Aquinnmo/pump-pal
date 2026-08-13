// Shared by app/(auth)/sign-in.tsx and sign-up.tsx. Reports failures upward via
// `onError` so each screen renders them in its own existing error banner rather
// than this component growing a second error surface.
import { timberAuthStyles } from '@/ui/timber-auth-shell';
import { useAuth } from '@/context/auth-context';
import { getFriendlyAuthError } from '@/lib/firebase-errors';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type GoogleSignInButtonProps = {
  onError: (message: string | null) => void;
  disabled?: boolean;
  label?: string;
};

export function GoogleSignInButton({ onError, disabled, label = 'Continue with Google' }: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    onError(null);
    setLoading(true);
    try {
      // No navigation on success: app/_layout.tsx routes the signed-in user to
      // (tabs) or /set-split once onAuthStateChanged fires. A dismissed picker
      // resolves false and is not an error.
      await signInWithGoogle();
    } catch (err) {
      console.warn('Google sign-in failed', err);
      onError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[timberAuthStyles.secondaryButton, (loading || disabled) && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={loading || disabled}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#fff" />
            <Text style={timberAuthStyles.secondaryButtonText}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // No top spacing: the parent card's gap already separates this block from the
  // primary button above it.
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  dividerText: {
    color: '#888',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
