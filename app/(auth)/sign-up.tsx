import { GoogleSignInButton } from "@/components/google-sign-in-button";
import {
  TimberAuthShell,
  TimberBrand,
  timberAuthStyles,
} from "@/components/timber-auth-shell";
import { auth } from "@/config/firebase";
import { profileRepository } from "@/db/profile-repository";
import { patchProfile } from "@/repositories/remote/profile";
import { isValidUsername } from "@/shared/username";
import { useAuth } from "@/context/auth-context";
import { ApiValidationError } from "@/utils/api-client";
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

// Set only for the generated-bundle personal iPhone build. See sign-in.tsx.
const IS_PERSONAL_IOS_BUILD =
  process.env.EXPO_PUBLIC_PERSONAL_IOS_BUILD === "1";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!isValidUsername(trimmedUsername)) {
      setError("Username must be 3-20 characters: letters, digits, underscore, starting with a letter.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      // Account already exists past this point — a username_taken failure
      // below is not fatal, the user just retries with the same account.
      if (!auth.currentUser) await signUp(email.trim(), password, trimmedUsername);
      const dto = await patchProfile({ username: trimmedUsername });
      const uid = auth.currentUser!.uid;
      const current = await profileRepository.get(uid);
      await profileRepository.upsert(uid, {
        ...(current?.data ?? {}),
        username: dto.username ?? trimmedUsername,
        usernameLower: trimmedUsername.toLowerCase(),
      });
      router.replace("/set-split");
    } catch (err: any) {
      if (err instanceof ApiValidationError && err.code === "username_taken") {
        setError("That username is taken. Try another.");
      } else {
        setError(getFriendlyAuthError(err));
      }
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
            <Text style={styles.heading}>Lay Down Your Roots</Text>

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
                placeholder="Username"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
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
                placeholder="Password (min 6 characters)"
                placeholderTextColor="#666"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              accessibilityLabel="Create Timber account"
              style={[
                timberAuthStyles.primaryButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={timberAuthStyles.primaryButtonText}>
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            {!IS_PERSONAL_IOS_BUILD && (
              <GoogleSignInButton
                onError={setError}
                disabled={loading}
                label="Sign up with Google"
              />
            )}

            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity style={styles.linkButton}>
                <Text style={styles.linkText}>
                  Already logging? <Text style={styles.linkBold}>Sign In</Text>
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
