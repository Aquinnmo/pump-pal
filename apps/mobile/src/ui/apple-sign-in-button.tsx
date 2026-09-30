// Shared by app/(auth)/sign-in.tsx and sign-up.tsx, sitting under the Google
// button (which owns the "or" divider). Same onError contract as
// GoogleSignInButton. Renders nothing off iOS: Apple's system button is the
// only one App Review accepts, and it does not exist elsewhere.
import { useAuth } from '@/context/auth-context';
import { getFriendlyAuthError } from '@/lib/firebase-errors';
import { isAppleSignInAvailable } from '@/lib/apple-sign-in';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type AppleSignInButtonProps = {
  onError: (message: string | null) => void;
  disabled?: boolean;
  type?: 'sign-in' | 'sign-up';
};

export function AppleSignInButton({ onError, disabled, type = 'sign-in' }: AppleSignInButtonProps) {
  const { signInWithApple } = useAuth();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAvailable, () => setAvailable(false));
  }, []);

  if (!available) return null;

  const handlePress = async () => {
    if (loading || disabled) return;
    onError(null);
    setLoading(true);
    try {
      // No navigation on success: app/_layout.tsx routes the signed-in user once
      // onAuthStateChanged fires. A dismissed sheet resolves false, not an error.
      await signInWithApple();
    } catch (err) {
      console.warn('Apple sign-in failed', err);
      onError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={(loading || disabled) && styles.buttonDisabled} pointerEvents={loading || disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          type === 'sign-up'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={14}
        style={styles.button}
        onPress={handlePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Height matches timberAuthStyles.secondaryButton (16pt padding + 16pt text).
  button: {
    height: 52,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
