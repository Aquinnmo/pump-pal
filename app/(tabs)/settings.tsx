import { Dropdown } from '@/components/ui/dropdown';
import { Toast } from '@/components/ui/toast';
import { auth, db } from '@/config/firebase';
import { SPLIT_OPTIONS, SplitOption, isSplitOption } from '@/constants/split-options';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function SettingsScreen() {
  const { user, logOut } = useAuth();
  const [selectedSplit, setSelectedSplit] = useState<SplitOption>('Push / Pull / Legs');
  const [customSplit, setCustomSplit] = useState('');
  const [loadingSplit, setLoadingSplit] = useState(true);
  const [savingSplit, setSavingSplit] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({  
    visible: false,
    message: '',
    type: 'success',
  });

  useEffect(() => {
    if (!user) return;

    const loadSplit = async () => {
      setLoadingSplit(true);
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        const split = snapshot.data()?.workoutSplit;

        if (isSplitOption(split?.type)) {
          setSelectedSplit(split.type);
        }

        if (typeof split?.custom === 'string') {
          setCustomSplit(split.custom);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSplit(false);
      }
    };

    loadSplit();
  }, [user]);

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        setToast({ visible: true, message: 'App is up to date', type: 'success' });
      }
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not check for updates', type: 'error' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSignOut = () => setShowSignOutModal(true);

  const handleChangePassword = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowChangePasswordModal(true);
  };

  const confirmChangePassword = async () => {
    if (!user || !user.email || newPassword !== confirmNewPassword || !newPassword) return;
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
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    setDeleteConfirmName('');
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!user || deleteConfirmName !== user.displayName) return;
    setDeletingAccount(true);
    try {
      const workoutsSnap = await getDocs(collection(db, 'users', user.uid, 'workouts'));
      await Promise.all(workoutsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'users', user.uid, 'pushup-challenge', 'data')).catch(() => {});
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(auth.currentUser!);
      router.replace('/(auth)/sign-in');
    } catch (err: any) {
      console.error(err);
      const msg =
        err.code === 'auth/requires-recent-login'
          ? 'Please sign out and sign back in before deleting your account.'
          : 'Could not delete account. Please try again.';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
      setDeleteConfirmName('');
    }
  };

  const confirmSignOut = async () => {
    setShowSignOutModal(false);
    await logOut();
    router.replace('/(auth)/sign-in');
  };

  const handleSaveSplit = async () => {
    if (!user) return;

    const trimmedCustom = customSplit.trim();

    if (selectedSplit === 'Other' && !trimmedCustom) {
      showAlert('Missing split', 'Please describe your split in the text box.');
      return;
    }

    setSavingSplit(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          workoutSplit: {
            type: selectedSplit,
            custom: selectedSplit === 'Other' ? trimmedCustom : null,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      setToast({ visible: true, message: 'Workout split updated', type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not save split', type: 'error' });
    } finally {
      setSavingSplit(false);
    }
  };

  const initial = user?.displayName?.[0]?.toUpperCase() ?? '?';

  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(true);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const containerHeightRef = useRef(0);

  const updateFades = () => {
    setShowTopFade(scrollYRef.current > 2);
    setShowBottomFade(scrollYRef.current + containerHeightRef.current < contentHeightRef.current - 2);
  };

  return (
    <View style={styles.container}>
      <Modal visible={showChangePasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalMessage}>Enter your current password and choose a new one.</Text>
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
                confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && styles.passwordInputError,
              ]}
              placeholder="Confirm new password"
              placeholderTextColor="#555"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowChangePasswordModal(false)}
                activeOpacity={0.8}
                disabled={changingPassword}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (newPassword !== confirmNewPassword || !newPassword || !oldPassword || changingPassword) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={confirmChangePassword}
                activeOpacity={0.8}
                disabled={newPassword !== confirmNewPassword || !newPassword || !oldPassword || changingPassword}>
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
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowDeleteModal(false)}
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

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <Text style={styles.title}>Settings</Text>

      <View style={styles.scrollWrapper}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
          updateFades();
        }}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
          updateFades();
        }}
        onLayout={(e) => {
          containerHeightRef.current = e.nativeEvent.layout.height;
          updateFades();
        }}
      >

      <View style={styles.avatarContainer}>
        <Text style={styles.displayName}>{user?.displayName ?? 'Athlete'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          This app is currently in development. Features may change and data may be used to improve the app.
        </Text>
      </View>

      {/* only because the styling for above doesn't make sense, remove once the disclaimers get removed */}

      <View style={{ height: 16 }} />

      <View style={styles.section}> 
        <View style={styles.splitHeader}>
          <Text style={styles.splitTitle}>Workout Split</Text>
          {loadingSplit ? <ActivityIndicator size="small" color="#e54242" /> : null}
        </View>

        <Dropdown
          options={SPLIT_OPTIONS}
          value={selectedSplit}
          onSelect={(val) => {
            setSelectedSplit(val as SplitOption);
            if (val !== 'Other') setCustomSplit('');
          }}
          placeholder="Select Your Split"
          style={styles.dropdownRow}
        />

        {selectedSplit === 'Other' && (
          <TextInput
            style={styles.customInput}
            placeholder="Describe your split"
            placeholderTextColor="#777"
            value={customSplit}
            onChangeText={setCustomSplit}
          />
        )}

        <TouchableOpacity
          style={[styles.saveButton, savingSplit && styles.saveButtonDisabled]}
          onPress={handleSaveSplit}
          disabled={savingSplit || loadingSplit}>
          {savingSplit ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Split</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.feedbackButton}
        onPress={() => Linking.openURL('mailto:adammontcompany@gmail.com?subject=Pump Pal Feedback')}
        activeOpacity={0.8}>
        <Ionicons name="megaphone" size={24} color="#fff" style={styles.rowIcon} />
        <Text style={styles.feedbackButtonText}>SEND FEEDBACK</Text>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.updateButton, checkingUpdate && styles.updateButtonDisabled]}
        onPress={handleCheckForUpdate}
        disabled={checkingUpdate}
        activeOpacity={0.8}>
        {checkingUpdate ? (
          <ActivityIndicator size="small" color="#fff" style={styles.rowIcon} />
        ) : (
          <Ionicons name="cloud-download" size={20} color="#fff" style={styles.rowIcon} />
        )}
        <Text style={styles.updateButtonText}>
          {checkingUpdate ? 'Checking...' : 'Update App'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.changePasswordButton, { marginBottom: 12 }]}
        onPress={handleChangePassword}
        activeOpacity={0.8}>
        <Ionicons name="lock-closed-outline" size={20} color="#aaa" style={styles.rowIcon} />
        <Text style={styles.changePasswordText}>Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.signOutButton, { marginBottom: 12 }]} onPress={handleSignOut}>
        <Ionicons name="log-out" size={20} color="#e54242" style={styles.rowIcon} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
        <Ionicons name="trash" size={20} color="#b00020" style={styles.rowIcon} />
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </TouchableOpacity>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          Your workout history may be sent to 3rd parties to power AI features.
        </Text>
      </View>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          App developed by{' '}
          <Text
            style={styles.attributionLink}
            onPress={() => Linking.openURL('https://adam-montgomery.ca/foundry')}>
            Montgomery Software Foundry Inc.
          </Text>
        </Text>
      </View>

      </ScrollView>

      {showTopFade && (
        <LinearGradient
          colors={['#0f0f0f', 'transparent']}
          style={styles.topFade}
          pointerEvents="none"
        />
      )}

      {showBottomFade && (
        <LinearGradient
          colors={['transparent', '#0f0f0f']}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    zIndex: 10,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 32,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e54242',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#888',
  },
  section: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  splitTitle: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  dropdownRow: {
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  customInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 10,
    backgroundColor: '#e54242',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
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
    color: '#b00020',
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
    color: '#aaa',
    fontWeight: '600',
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
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#e54242',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  feedbackButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  attributionCard: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  attributionText: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
  },
  attributionLink: {
    color: '#888',
    textDecorationLine: 'underline',
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
