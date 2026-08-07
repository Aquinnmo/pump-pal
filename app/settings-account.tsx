import { Toast } from "@/components/ui/toast";
import { auth } from "@/config/firebase";
import { useAuth } from "@/context/auth-context";
import { purgeLocalAccountData, syncBeforeSignOut } from "@/db/account-data";
import { endSession } from "@/utils/active-workout-session";
import { deleteAccountData } from "@/repositories/remote/account";
import { getFriendlyAuthError } from "@/utils/firebase-errors";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { deleteUser, sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Set only for the generated-bundle personal iPhone build. Its OAuth client
// cannot be used with the private bundle identifier created by the installer.
const IS_PERSONAL_IOS_BUILD = process.env.EXPO_PUBLIC_PERSONAL_IOS_BUILD === "1";

export default function SettingsAccountScreen() {
  const { user, logOut, googleConnection, connectGoogleAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [googleLinkError, setGoogleLinkError] = useState("");
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const handleSignOut = () => {
    setSignOutError("");
    setShowSignOutModal(true);
  };

  const handleChangePassword = () => {
    setChangePasswordError("");
    setShowChangePasswordModal(true);
  };

  const handleConnectGoogle = async () => {
    setGoogleLinkError("");
    try {
      const connected = await connectGoogleAccount();
      if (connected)
        setToast({
          visible: true,
          message: "Google connected",
          type: "success",
        });
    } catch (error) {
      setGoogleLinkError(getFriendlyAuthError(error));
    }
  };

  const isPasswordAccount =
    user?.providerData.some((provider) => provider.providerId === "password") ??
    false;

  const confirmChangePassword = async () => {
    if (!user || !user.email) return;

    setSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setShowChangePasswordModal(false);
      setToast({
        visible: true,
        message: "Password reset email sent",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setChangePasswordError("Could not send reset email. Please try again.");
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleDeleteAccount = () => {
    setDeleteConfirmName("");
    setDeleteModalError("");
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!user || deleteConfirmName !== user.displayName) return;
    setDeletingAccount(true);
    try {
      await deleteAccountData();
      await purgeLocalAccountData(user.uid);
      await deleteUser(auth.currentUser!);
      setShowDeleteModal(false);
      setDeleteConfirmName("");
      router.replace("/(auth)/sign-in");
    } catch (err: any) {
      console.error(err);
      const msg =
        err.code === "auth/requires-recent-login"
          ? "Please sign out and sign back in before deleting your account."
          : "Could not delete account. Please try again.";
      setDeleteModalError(msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const finishSignOut = async () => {
    if (!user) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      // A live workout only ever exists in memory now (see
      // utils/active-workout-session.ts) — nothing was written to it, so there's
      // nothing to discard on the way out. Just drop the session so it doesn't
      // resurrect for whoever signs in next on this device.
      endSession();
      await syncBeforeSignOut(user.uid);
      await purgeLocalAccountData(user.uid);
      setShowSignOutModal(false);
      await logOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error(error);
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 24 }} />
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <Modal visible={showChangePasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalMessage}>
              {"We'll send a password reset link to "}
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {user?.email}
              </Text>
              {"."}
            </Text>
            {changePasswordError ? (
              <Text style={styles.modalErrorText}>{changePasswordError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordError("");
                }}
                activeOpacity={0.8}
                disabled={sendingResetEmail}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  sendingResetEmail && styles.modalButtonDisabled,
                ]}
                onPress={confirmChangePassword}
                activeOpacity={0.8}
                disabled={sendingResetEmail}
              >
                {sendingResetEmail ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              {
                "This will permanently delete your account and all associated data. This cannot be undone.\n\nType your name "
              }
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {user?.displayName}
              </Text>
              {" to confirm."}
            </Text>
            <TextInput
              style={styles.deleteConfirmInput}
              placeholder="Your name"
              placeholderTextColor="#555"
              value={deleteConfirmName}
              onChangeText={setDeleteConfirmName}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {deleteModalError ? (
              <Text style={styles.modalErrorText}>{deleteModalError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteModalError("");
                }}
                activeOpacity={0.8}
                disabled={deletingAccount}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  styles.modalDeleteButton,
                  (deleteConfirmName !== user?.displayName ||
                    deletingAccount) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={confirmDeleteAccount}
                activeOpacity={0.8}
                disabled={
                  deleteConfirmName !== user?.displayName || deletingAccount
                }
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSignOutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            {signOutError ? (
              <Text style={styles.modalErrorText}>{signOutError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSignOutModal(false)}
                activeOpacity={0.8}
                disabled={signingOut}
              >
                <Text style={styles.modalCancelText}>Stay Signed In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={finishSignOut}
                activeOpacity={0.8}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.content}>
        {isPasswordAccount && !IS_PERSONAL_IOS_BUILD && (
          <View style={styles.googleConnection}>
            {googleConnection === "connected" ? (
              <View
                accessibilityLabel="Google sign-in connected"
                accessibilityRole="text"
                style={styles.googleConnectedRow}
              >
                <Ionicons
                  name="logo-google"
                  size={20}
                  color="#fff"
                  style={styles.rowIcon}
                />
                <View style={styles.googleCopy}>
                  <Text style={styles.googleTitle}>Google</Text>
                  <Text selectable style={styles.googleConnectedText}>
                    Connected
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  googleConnection === "connecting"
                    ? "Connecting Google"
                    : "Connect Google"
                }
                activeOpacity={0.8}
                disabled={googleConnection === "connecting"}
                onPress={handleConnectGoogle}
                style={[
                  styles.googleConnectButton,
                  googleConnection === "connecting" &&
                    styles.modalButtonDisabled,
                ]}
              >
                {googleConnection === "connecting" ? (
                  <ActivityIndicator
                    size="small"
                    color="#fff"
                    style={styles.rowIcon}
                  />
                ) : (
                  <Ionicons
                    name="logo-google"
                    size={20}
                    color="#fff"
                    style={styles.rowIcon}
                  />
                )}
                <View style={styles.googleCopy}>
                  <Text style={styles.googleTitle}>
                    {googleConnection === "connecting"
                      ? "Connecting Google"
                      : "Connect Google"}
                  </Text>
                  <Text style={styles.googleHint}>
                    Use the same email as this account.
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            {googleLinkError ? (
              <Text selectable style={styles.googleError}>
                {googleLinkError}
              </Text>
            ) : null}
          </View>
        )}

        <TouchableOpacity
          style={[styles.changePasswordButton, { marginBottom: 12 }]}
          onPress={handleChangePassword}
          activeOpacity={0.8}
        >
          <Ionicons
            name="lock-closed"
            size={20}
            color="#fff"
            style={styles.rowIcon}
          />
          <Text style={styles.changePasswordText}>Change Password</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, { marginBottom: 12 }]}
          onPress={handleSignOut}
        >
          <Ionicons
            name="log-out"
            size={20}
            color="#e54242"
            style={styles.rowIcon}
          />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
        >
          <Ionicons
            name="trash"
            size={20}
            color="#e54242"
            style={styles.rowIcon}
          />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
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
  googleConnection: {
    marginBottom: 12,
  },
  googleConnectButton: {
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderColor: "#2a2a2a",
    borderCurve: "continuous",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  googleConnectedRow: {
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderColor: "#2a2a2a",
    borderCurve: "continuous",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  googleCopy: {
    flex: 1,
    gap: 4,
  },
  googleTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  googleHint: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
  },
  googleConnectedText: {
    color: "#4ade80",
    fontSize: 14,
    fontWeight: "500",
  },
  googleError: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    marginTop: 8,
  },
  rowIcon: {
    marginRight: 12,
  },
  changePasswordButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  changePasswordText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 15,
    color: "#e54242",
    fontWeight: "600",
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3a1010",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  deleteAccountText: {
    fontSize: 15,
    color: "#e54242",
    fontWeight: "600",
  },
  deleteConfirmInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3a1010",
    backgroundColor: "#151515",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 20,
  },
  modalDeleteButton: {
    backgroundColor: "#b00020",
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: "#1c1c1c",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 24,
    width: "100%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: "#888",
    marginBottom: 24,
    lineHeight: 21,
  },
  modalErrorText: {
    fontSize: 14,
    color: "#ff8b8b",
    marginBottom: 12,
    textAlign: "left",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#e54242",
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
