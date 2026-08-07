import { GoogleSignInButton } from "@/components/google-sign-in-button";
import {
  TimberAuthShell,
  TimberBrand,
  timberAuthStyles,
} from "@/components/timber-auth-shell";
import { useAuth } from "@/context/auth-context";
import { getFriendlyAuthError } from "@/utils/firebase-errors";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useState } from "react";
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
} from "react-native";

// This is injected only by scripts/ios/update.sh. The personal installer uses
// a generated bundle ID, so its published iOS Google OAuth client cannot work.
const IS_PERSONAL_IOS_BUILD =
  process.env.EXPO_PUBLIC_PERSONAL_IOS_BUILD === "1";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <TimberAuthShell>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          <TimberBrand />

          <View style={styles.formCard}>
            <Text style={styles.heading}>Pick Up Your Log</Text>

            {error && (
              <View style={timberAuthStyles.errorBanner}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color="#f87171"
                  style={styles.errorIcon}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.fields}>
              <TextInput
                style={timberAuthStyles.field}
                placeholder="Email"
                placeholderTextColor="#666"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={timberAuthStyles.field}
                placeholder="Password"
                placeholderTextColor="#666"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              accessibilityLabel="Sign in to Timber"
              style={[
                timberAuthStyles.primaryButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={timberAuthStyles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {!IS_PERSONAL_IOS_BUILD && (
              <GoogleSignInButton onError={setError} disabled={loading} />
            )}

            <Link href="/(auth)/sign-up" asChild>
              <TouchableOpacity style={styles.linkButton}>
                <Text style={styles.linkText}>
                  New to Timber?{" "}
                  <Text style={styles.linkBold}>Create Account</Text>
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
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  formCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    // One gap owns the whole card's vertical rhythm. Children set no top or
    // bottom margins, so adding or removing one (a hint line, the error banner)
    // can't leave two elements touching.
    gap: 20,
  },
  heading: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  fields: {
    gap: 12,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    color: "#888",
    fontSize: 14,
  },
  linkBold: {
    color: "#c9a567",
    fontWeight: "800",
  },
});
