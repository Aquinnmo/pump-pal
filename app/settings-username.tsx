import { Toast } from "@/components/ui/toast";
import { bumpDataVersion } from "@/db/data-version";
import { profileRepository } from "@/db/profile-repository";
import { patchProfile } from "@/repositories/remote/profile";
import { isValidUsername } from "@/shared/username";
import { useAuth } from "@/context/auth-context";
import { ApiValidationError } from "@/utils/api-client";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsUsernameScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [loadingUsername, setLoadingUsername] = useState(true);
  const [savingUsername, setSavingUsername] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    if (!user) return;

    const loadUsername = async () => {
      setLoadingUsername(true);
      try {
        const profile = await profileRepository.get(user.uid);
        const current = profile?.data.username ?? "";
        setUsername(current);
        setOriginalUsername(current);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingUsername(false);
      }
    };

    loadUsername();
  }, [user]);

  const handleSaveUsername = async () => {
    if (!user) return;

    const trimmed = username.trim();
    if (trimmed === originalUsername) return;

    if (!isValidUsername(trimmed)) {
      setToast({
        visible: true,
        message: "3-20 characters: letters, digits, underscore, starting with a letter.",
        type: "error",
      });
      return;
    }

    setSavingUsername(true);
    try {
      const dto = await patchProfile({ username: trimmed });
      const current = await profileRepository.get(user.uid);
      await profileRepository.upsert(user.uid, {
        ...(current?.data ?? {}),
        username: dto.username ?? trimmed,
        usernameLower: trimmed.toLowerCase(),
      });
      bumpDataVersion();
      setOriginalUsername(trimmed);
      setToast({ visible: true, message: "Username updated", type: "success" });
    } catch (err) {
      if (err instanceof ApiValidationError && err.code === "username_taken") {
        setToast({ visible: true, message: "That username is taken. Try another.", type: "error" });
      } else {
        console.error(err);
        setToast({ visible: true, message: "Could not save username", type: "error" });
      }
    } finally {
      setSavingUsername(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Username</Text>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Username</Text>
            {loadingUsername ? <ActivityIndicator size="small" color="#e54242" /> : null}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />

          <TouchableOpacity
            style={[
              styles.saveButton,
              (savingUsername || loadingUsername || username.trim() === originalUsername) &&
                styles.saveButtonDisabled,
            ]}
            onPress={handleSaveUsername}
            disabled={savingUsername || loadingUsername || username.trim() === originalUsername}>
            {savingUsername ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Username</Text>
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
    backgroundColor: "#0f0f0f",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sectionTitle: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#151515",
    color: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveButton: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 10,
    backgroundColor: "#e54242",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
