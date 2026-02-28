import { Dropdown } from '@/components/ui/dropdown';
import { Toast } from '@/components/ui/toast';
import { auth, db } from '@/config/firebase';
import { SPLIT_OPTIONS, SplitOption, isSplitOption } from '@/constants/split-options';
import { useAuth } from '@/context/auth-context';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { File as FSFile, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
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
  const [deleteModalError, setDeleteModalError] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    setChangePasswordError('');
    setShowChangePasswordModal(true);
  };

  const confirmChangePassword = async () => {
    if (!user || !user.email) return;
    // client-side validation
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

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const workoutsSnap = await getDocs(
        collection(db, 'users', user.uid, 'workouts')
      );

      const rows: string[] = [
        ['Date', 'Workout', 'Notes', 'Exercise', 'Type', 'Sets', 'Reps', 'Weight (lbs)', 'Duration (min)', 'Duration (sec)', 'Bodyweight'].join(','),
      ];

      workoutsSnap.docs.forEach((d) => {
        const w = d.data();
        const dateMs = w.date?.seconds ? w.date.seconds * 1000 : Date.now();
        const dateStr = new Date(dateMs).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const name = `"${(w.name ?? '').replace(/"/g, '""')}"`;
        const notes = `"${(w.notes ?? '').replace(/"/g, '""')}"`;

        if (w.exercises && w.exercises.length > 0) {
          (w.exercises as any[]).forEach((ex) => {
            const exName = `"${(ex.name ?? '').replace(/"/g, '""')}"`;
            const exType = ex.exerciseType ?? 'Sets of Reps';
            rows.push(
              [
                dateStr,
                name,
                notes,
                exName,
                exType,
                ex.sets ?? '',
                ex.reps ?? '',
                ex.bodyweight ? '' : (ex.weight ?? ''),
                ex.durationMinutes ?? '',
                ex.durationSeconds ?? '',
                ex.bodyweight ? 'Yes' : 'No',
              ].join(',')
            );
          });
        } else {
          rows.push([dateStr, name, notes, '', '', '', '', '', '', '', ''].join(','));
        }
      });

      const csv = rows.join('\n');
      const fileName = `pump-pal-workouts-${new Date().toISOString().slice(0, 10)}.csv`;
      const file = new FSFile(Paths.cache, fileName);
      if (file.exists) file.delete();
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export Training Data', UTI: 'public.comma-separated-values-text' });
      } else {
        setToast({ visible: true, message: 'Sharing is not available on this device', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not export data', type: 'error' });
    } finally {
      setExporting(false);
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
        <Ionicons name="lock-closed" size={20} color="#fff" style={styles.rowIcon} />
        <Text style={styles.changePasswordText}>Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.changePasswordButton, { marginBottom: 12 }, exporting && styles.updateButtonDisabled]}
        onPress={handleExportData}
        disabled={exporting}
        activeOpacity={0.8}>
        {exporting ? (
          <ActivityIndicator size="small" color="#fff" style={styles.rowIcon} />
        ) : (
          <Ionicons name="download" size={20} color="#fff" style={styles.rowIcon} />
        )}
        <Text style={styles.changePasswordText}>{exporting ? 'Exporting...' : 'Export Training Data'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.signOutButton, { marginBottom: 12 }]} onPress={handleSignOut}>
        <Ionicons name="log-out" size={20} color="#e54242" style={styles.rowIcon} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
        <Ionicons name="trash" size={20} color="#e54242" style={styles.rowIcon} />
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
