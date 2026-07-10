import { Toast } from '@/components/ui/toast';
import { auth, db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsAccountScreen() {
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const handleSignOut = () => setShowSignOutModal(true);

  const handleChangePassword = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setChangePasswordError('');
    setShowChangePasswordModal(true);
  };

  const confirmChangePassword = async () => {
    if (!user || !user.email) return;
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError('Password must be at least 6 characters.');
      return;
    }
    if (!oldPassword) {
      setChangePasswordError('Please enter your current password.');
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, newPassword);
      setShowChangePasswordModal(false);
      setToast({ visible: true, message: 'Password updated successfully', type: 'success' });
    } catch (err: any) {
      console.error(err);
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : err.code === 'auth/weak-password'
          ? 'New password must be at least 6 characters.'
          : 'Could not update password. Please try again.';
      setChangePasswordError(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    setDeleteConfirmName('');
    setDeleteModalError('');
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!user || deleteConfirmName !== user.displayName) return;
    setDeletingAccount(true);
    try {
      const v2Snap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid))
      );
      await Promise.all(v2Snap.docs.map((d) => deleteDoc(d.ref)));

      const workoutsSnap = await getDocs(collection(db, 'users', user.uid, 'workouts'));
      await Promise.all(workoutsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'users', user.uid, 'pushup-challenge', 'data')).catch(() => {});
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(auth.currentUser!);
      setShowDeleteModal(false);
      setDeleteConfirmName('');
      router.replace('/(auth)/sign-in');
    } catch (err: any) {
      console.error(err);
      const msg =
        err.code === 'auth/requires-recent-login'
          ? 'Please sign out and sign back in before deleting your account.'
          : 'Could not delete account. Please try again.';
      setDeleteModalError(msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmSignOut = async () => {
    setShowSignOutModal(false);
    await logOut();
    router.replace('/(auth)/sign-in');
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
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalMessage}>New passwords must be at least 6 characters.</Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="Current password"
              placeholderTextColor="#555"
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.passwordInput}
              placeholder="New password"
              placeholderTextColor="#555"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[
                styles.passwordInput,
                styles.passwordInputLast,
                (confirmNewPassword.length > 0 && newPassword !== confirmNewPassword) || (newPassword.length > 0 && newPassword.length < 6)
                  ? styles.passwordInputError
                  : null,
              ]}
              placeholder="Confirm new password"
              placeholderTextColor="#555"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {changePasswordError ? (
              <Text style={styles.modalErrorText}>{changePasswordError}</Text>
            ) : newPassword.length > 0 && newPassword.length < 6 ? (
              <Text style={styles.modalErrorText}>Password must be at least 6 characters.</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordError('');
                }}
                activeOpacity={0.8}
                disabled={changingPassword}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (newPassword !== confirmNewPassword || newPassword.length < 6 || !oldPassword || changingPassword) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={confirmChangePassword}
                activeOpacity={0.8}
                disabled={newPassword !== confirmNewPassword || newPassword.length < 6 || !oldPassword || changingPassword}>
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Update</Text>
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
              {'This will permanently delete your account and all associated data. This cannot be undone.\n\nType your name '}
              <Text style={{ color: '#fff', fontWeight: '700' }}>{user?.displayName}</Text>
              {' to confirm.'}
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
            {deleteModalError ? <Text style={styles.modalErrorText}>{deleteModalError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteModalError('');
                }}
                activeOpacity={0.8}
                disabled={deletingAccount}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  styles.modalDeleteButton,
                  (deleteConfirmName !== user?.displayName || deletingAccount) && styles.modalButtonDisabled,
                ]}
                onPress={confirmDeleteAccount}
                activeOpacity={0.8}
                disabled={deleteConfirmName !== user?.displayName || deletingAccount}>
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
            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSignOutModal(false)}
                activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmSignOut}
                activeOpacity={0.8}>
                <Text style={styles.modalConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.changePasswordButton, { marginBottom: 12 }]}
          onPress={handleChangePassword}
          activeOpacity={0.8}>
          <Ionicons name="lock-closed" size={20} color="#fff" style={styles.rowIcon} />
          <Text style={styles.changePasswordText}>Change Password</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.signOutButton, { marginBottom: 12 }]} onPress={handleSignOut}>
          <Ionicons name="log-out" size={20} color="#e54242" style={styles.rowIcon} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Ionicons name="trash" size={20} color="#e54242" style={styles.rowIcon} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    padding: 20,
  },
  rowIcon: {
    marginRight: 12,
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  changePasswordText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3a1010',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  deleteAccountText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
  },
  deleteConfirmInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a1010',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 20,
  },
  modalDeleteButton: {
    backgroundColor: '#b00020',
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
  passwordInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  passwordInputLast: {
    marginBottom: 20,
  },
  passwordInputError: {
    borderColor: '#b00020',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: '#888',
    marginBottom: 24,
    lineHeight: 21,
  },
  modalErrorText: {
    fontSize: 14,
    color: '#ff8b8b',
    marginBottom: 12,
    textAlign: 'left',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e54242',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
